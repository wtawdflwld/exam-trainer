'use strict';

// 手動で編集するファイル: questions.csv
// 出題履歴はブラウザのIndexedDBへ保存します。
const CSV_FILE = './questions.csv';
const DB_NAME = 'kakomon-note-v1';
const DB_STORE = 'progress';
const REQUIRED_HEADERS = [
  'id', 'qualification', 'year', 'session', 'category', 'topic',
  'question', 'choice1', 'choice2', 'choice3', 'choice4', 'answer', 'explanation', 'image'
];
const JP_CHOICE_LABELS = ['イ', 'ロ', 'ハ', 'ニ'];
const FILTERS = [
  ['filterQual', 'qualification'], ['filterYear', 'year'],
  ['filterSession', 'session'], ['filterCategory', 'category'], ['filterTopic', 'topic']
];
const byId = (id) => document.getElementById(id);

let database;
let questions = [];
let history = new Map();
let session = null;
let toastHandle = null;

function notify(message) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastHandle);
  toastHandle = setTimeout(() => { toast.hidden = true; }, 3600);
}
function showView(name) {
  for (const viewName of ['home', 'study', 'result']) {
    byId(`${viewName}View`).hidden = viewName !== name;
  }
  window.scrollTo(0, 0);
}
function updateNetworkBadge() {
  const badge = byId('networkBadge');
  const online = navigator.onLine;
  badge.textContent = online ? '通信可能' : 'オフライン';
  badge.className = `pill ${online ? 'online' : 'offline'}`;
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('このブラウザは学習履歴の保存に対応していません。')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('保存領域を開けませんでした。'));
  });
}
function dbTransaction(mode, work) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, mode);
    const store = transaction.objectStore(DB_STORE);
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('学習記録の保存に失敗しました。'));
    transaction.onabort = () => reject(transaction.error || new Error('学習記録の処理が中断しました。'));
    const request = work(store);
    if (request) {
      request.onsuccess = () => { result = request.result; };
    }
  });
}
async function loadHistory() {
  const records = await dbTransaction('readonly', (store) => store.getAll());
  history = new Map(records.map((record) => [record.id, record]));
}
async function writeHistory(record) {
  await dbTransaction('readwrite', (store) => store.put(record));
  history.set(record.id, record);
}
function currentRecord(id) {
  return history.get(id) || { id, attempts: 0, correct: 0, lastCorrect: null, starred: false, lastAnsweredAt: null };
}

// ExcelのUTF-8 CSVを想定。引用符、カンマ、セル内改行に対応。
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (quoted) throw new Error('CSVの引用符が閉じられていません。');
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}
function isSafeImagePath(path) {
  return path === '' || (path.startsWith('images/') && !path.includes('..') && !path.includes('\\') && !/[?#]/.test(path) && /\.(png|jpe?g|webp|gif|svg)$/i.test(path));
}
function decodeQuestions(csv) {
  const rows = parseCSV(csv);
  if (rows.length < 2) throw new Error('questions.csv に問題が登録されていません。');
  const headers = rows[0].map((value) => value.trim());
  const missing = REQUIRED_HEADERS.filter((key) => !headers.includes(key));
  if (missing.length) throw new Error(`CSVの列が不足しています: ${missing.join(', ')}`);
  const used = new Set();
  return rows.slice(1).map((row, index) => {
    const source = Object.fromEntries(headers.map((header, n) => [header, (row[n] || '').trim()]));
    const line = index + 2;
    if (!source.id || used.has(source.id)) throw new Error(`${line}行目: idが空欄か重複しています: ${source.id}`);
    used.add(source.id);
    if (!source.question || !source.qualification || !source.category) throw new Error(`${line}行目: 問題文・資格・分野は必須です。`);
    if (![1, 2, 3, 4].includes(Number(source.answer))) throw new Error(`${line}行目: answerには1～4を入力してください。`);
    if ([source.choice1, source.choice2, source.choice3, source.choice4].some((value) => !value)) throw new Error(`${line}行目: 4つの選択肢をすべて入力してください。`);
    if (!isSafeImagePath(source.image)) throw new Error(`${line}行目: imageは images/ 以下の画像ファイルを指定してください。`);
    return {
      ...source,
      choices: [source.choice1, source.choice2, source.choice3, source.choice4],
      answer: Number(source.answer)
    };
  });
}
async function fetchQuestions() {
  const response = await fetch(CSV_FILE, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`問題データを取得できません (HTTP ${response.status})。`);
  return decodeQuestions(await response.text());
}
function selectedFilters() {
  return Object.fromEntries(FILTERS.map(([id, key]) => [key, byId(id).value]));
}
function filteredQuestions() {
  const f = selectedFilters();
  const mode = document.querySelector('input[name="studyMode"]:checked').value;
  return questions.filter((q) =>
    FILTERS.every(([, key]) => !f[key] || q[key] === f[key]) &&
    (mode === 'all' || (mode === 'wrong' && currentRecord(q.id).lastCorrect === false) ||
    (mode === 'starred' && currentRecord(q.id).starred))
  );
}
function setSelectOptions(id, values) {
  const element = byId(id);
  const old = element.value;
  element.replaceChildren(new Option('すべて', ''));
  const items = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
  for (const value of items) element.add(new Option(value, value));
  element.value = items.includes(old) ? old : '';
}
function refreshFilters() {
  let candidates = questions;
  for (const [id, key] of FILTERS) {
    setSelectOptions(id, candidates.map((q) => q[key]));
    const value = byId(id).value;
    if (value) candidates = candidates.filter((q) => q[key] === value);
  }
  updateMatchedCount();
}
function updateMatchedCount() {
  const count = filteredQuestions().length;
  byId('matchedCount').textContent = `該当する問題: ${count}問`;
  byId('startBtn').disabled = count === 0;
}
function refreshStats() {
  const ids = new Set(questions.map((q) => q.id));
  const records = [...history.values()].filter((r) => ids.has(r.id));
  const attempts = records.reduce((a, r) => a + r.attempts, 0);
  const correct = records.reduce((a, r) => a + r.correct, 0);
  byId('statAll').textContent = questions.length;
  byId('statDone').textContent = records.filter((r) => r.attempts > 0).length;
  byId('statRate').textContent = attempts ? Math.round(correct * 100 / attempts) : '—';
  byId('statWrong').textContent = records.filter((r) => r.lastCorrect === false).length;
  updateMatchedCount();
}
function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
function startStudy() {
  const selected = filteredQuestions().slice();
  if (!selected.length) return notify('該当する問題がありません。');
  if (byId('randomOrder').checked) shuffle(selected);
  const limit = byId('questionCount').value;
  session = { items: limit === 'all' ? selected : selected.slice(0, Number(limit)), index: 0, correct: 0, answered: false };
  showView('study');
  renderQuestion();
}
function renderQuestion() {
  const q = session.items[session.index];
  const i = session.index;
  session.answered = false;
  byId('questionCounter').textContent = `${i + 1} / ${session.items.length}`;
  const percent = i / session.items.length * 100;
  byId('progressFill').style.width = `${percent}%`;
  byId('progressTrack').setAttribute('aria-valuenow', String(Math.round(percent)));
  const meta = byId('questionMeta');
  meta.replaceChildren();
  for (const value of [q.qualification, q.year, q.session, q.category, q.topic].filter(Boolean)) {
    const span = document.createElement('span');
    span.className = 'meta-tag';
    span.textContent = value;
    meta.append(span);
  }
  byId('questionTitle').textContent = `問題 ${i + 1}`;
  byId('questionText').textContent = q.question;
  const image = byId('questionImage');
  image.hidden = !q.image;
  image.alt = `${q.id} の参考図`;
  image.onerror = () => { image.hidden = true; notify('画像の読み込みに失敗しました。画像ファイルを確認してください。'); };
  if (q.image) image.src = q.image;
  else image.removeAttribute('src');
  updateStar();
  const choices = byId('choices');
  choices.replaceChildren();
  q.choices.forEach((label, choiceIndex) => {
    const button = document.createElement('button');
    button.className = 'choice';
    button.type = 'button';
    const mark = document.createElement('span'); mark.className = 'choice-mark'; mark.textContent = JP_CHOICE_LABELS[choiceIndex];
    const text = document.createElement('span'); text.textContent = label;
    button.append(mark, text);
    button.addEventListener('click', () => chooseAnswer(choiceIndex + 1));
    choices.append(button);
  });
  byId('answerPanel').hidden = true;
  byId('nextBtn').hidden = true;
  byId('nextBtn').textContent = i === session.items.length - 1 ? '結果を見る →' : '次の問題へ →';
}
function updateStar() {
  const q = session.items[session.index];
  const flagged = currentRecord(q.id).starred;
  const button = byId('starBtn');
  button.textContent = flagged ? '★' : '☆';
  button.classList.toggle('selected', flagged);
  button.setAttribute('aria-label', flagged ? 'お気に入りから外す' : 'お気に入りに登録');
}
async function toggleStar() {
  if (!session) return;
  const q = session.items[session.index];
  const entry = { ...currentRecord(q.id), starred: !currentRecord(q.id).starred };
  try { await writeHistory(entry); updateStar(); refreshStats(); }
  catch (error) { notify(error.message); }
}
async function chooseAnswer(choice) {
  if (!session || session.answered) return;
  session.answered = true;
  const q = session.items[session.index];
  const isCorrect = choice === q.answer;
  if (isCorrect) session.correct++;
  const record = currentRecord(q.id);
  const nextRecord = {
    ...record, attempts: record.attempts + 1, correct: record.correct + (isCorrect ? 1 : 0),
    lastCorrect: isCorrect, lastAnsweredAt: new Date().toISOString()
  };
  try { await writeHistory(nextRecord); }
  catch (error) { notify(`履歴を保存できません: ${error.message}`); }
  [...byId('choices').children].forEach((button, index) => {
    button.disabled = true;
    if (index + 1 === q.answer) button.classList.add('correct');
    else if (index + 1 === choice) button.classList.add('wrong');
  });
  const result = byId('answerResult');
  result.className = isCorrect ? 'good' : 'bad';
  result.textContent = isCorrect ? '正解です' : `不正解です（正解：${JP_CHOICE_LABELS[q.answer - 1]}）`;
  byId('answerExplanation').textContent = q.explanation || '解説は登録されていません。';
  byId('answerPanel').hidden = false;
  byId('nextBtn').hidden = false;
  refreshStats();
}
function nextQuestion() {
  if (!session?.answered) return;
  if (session.index + 1 < session.items.length) {
    session.index++;
    renderQuestion();
    window.scrollTo(0, 0);
  } else {
    byId('progressFill').style.width = '100%';
    byId('resultCorrect').textContent = session.correct;
    byId('resultTotal').textContent = session.items.length;
    const percent = Math.round(session.correct * 100 / session.items.length);
    byId('resultComment').textContent = `今回の正解率は${percent}%です。誤答した問題は「要復習」から再挑戦できます。`;
    showView('result');
    session = null;
  }
}
function returnHome() { session = null; refreshStats(); showView('home'); }

async function exportHistory() {
  try {
    const all = await dbTransaction('readonly', (store) => store.getAll());
    const data = { format: 'kakomon-note-backup', version: 1, exportedAt: new Date().toISOString(), progress: all };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `kakomon-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    notify('バックアップファイルを作成しました。保存先を確認してください。');
  } catch (error) { notify(`バックアップ失敗: ${error.message}`); }
}
async function restoreHistory(event) {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.format !== 'kakomon-note-backup' || data.version !== 1 || !Array.isArray(data.progress)) throw new Error('対応していないバックアップファイルです。');
    const rows = data.progress.map((r) => {
      if (typeof r.id !== 'string' || !r.id || !Number.isSafeInteger(r.attempts) || r.attempts < 0 ||
        !Number.isSafeInteger(r.correct) || r.correct < 0 || r.correct > r.attempts ||
        typeof r.starred !== 'boolean' || ![true, false, null].includes(r.lastCorrect)) {
        throw new Error('学習履歴に不正なデータがあります。');
      }
      return { id: r.id, attempts: r.attempts, correct: r.correct, starred: r.starred, lastCorrect: r.lastCorrect, lastAnsweredAt: r.lastAnsweredAt || null };
    });
    if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new Error('学習履歴に重複IDがあります。');
    if (!confirm(`現在の学習履歴を置き換えて、${rows.length}件の履歴を復元しますか？`)) return;
    await dbTransaction('readwrite', (store) => { store.clear(); rows.forEach((row) => store.put(row)); });
    await loadHistory(); refreshStats();
    notify(`${rows.length}件の学習履歴を復元しました。`);
  } catch (error) { notify(`復元に失敗しました: ${error.message}`); }
  finally { input.value = ''; }
}
async function eraseHistory() {
  if (!confirm('この端末のすべての解答履歴・お気に入りを削除します。元には戻せません。よろしいですか？')) return;
  try {
    await dbTransaction('readwrite', (store) => store.clear());
    history.clear(); refreshStats(); notify('学習履歴を削除しました。');
  } catch (error) { notify(`削除できませんでした: ${error.message}`); }
}

async function prepareOffline({ silent = false } = {}) {
  const message = byId('offlineMessage');
  if (!('serviceWorker' in navigator) || !('caches' in window) || !window.isSecureContext) {
    message.textContent = 'オフライン利用には HTTPS または localhost での起動が必要です。';
    return;
  }
  message.textContent = 'アプリと問題画像を保存しています…';
  try {
    await navigator.serviceWorker.ready;
    const imagePaths = [...new Set(questions.map((q) => q.image).filter(Boolean))];
    const cache = await caches.open('exam-trainer-media-v1');
    let failed = 0;
    for (const path of imagePaths) {
      const request = new Request(new URL(path, document.baseURI));
      if (await caches.match(request)) continue;
      try {
        const response = await fetch(request);
        if (!response.ok) { failed++; continue; }
        await cache.put(request, response.clone());
      } catch (_) { failed++; }
    }
    const core = ['./index.html', './style.css', './app.js', './questions.csv', './manifest.webmanifest'];
    let coreReady = true;
    for (const path of core) {
      if (!await caches.match(new URL(path, document.baseURI))) coreReady = false;
    }
    if (failed || !coreReady) {
      message.textContent = `一部のデータを保存できませんでした（画像不足 ${failed}件）。通信状態を確認して再試行してください。`;
      if (!silent) notify('オフライン準備を完了できませんでした。');
    } else {
      message.textContent = `準備完了。アプリ・全${questions.length}問・画像${imagePaths.length}件を保存済み。`;
      if (!silent) notify('オフライン用データの準備が完了しました。');
    }
  } catch (error) {
    message.textContent = `オフライン準備に失敗しました: ${error.message}`;
  }
}
async function registerWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try { await navigator.serviceWorker.register('./sw.js'); }
  catch (error) { byId('offlineMessage').textContent = `オフライン機能を登録できません: ${error.message}`; }
}
function initEvents() {
  for (const [index, [id]] of FILTERS.entries()) {
    byId(id).addEventListener('change', () => {
      for (const [followingId] of FILTERS.slice(index + 1)) byId(followingId).value = '';
      refreshFilters();
    });
  }
  document.querySelectorAll('input[name="studyMode"]').forEach((item) => item.addEventListener('change', updateMatchedCount));
  byId('startBtn').addEventListener('click', startStudy);
  byId('starBtn').addEventListener('click', toggleStar);
  byId('nextBtn').addEventListener('click', nextQuestion);
  byId('quitBtn').addEventListener('click', returnHome);
  byId('returnBtn').addEventListener('click', returnHome);
  byId('exportBtn').addEventListener('click', exportHistory);
  byId('restoreInput').addEventListener('change', restoreHistory);
  byId('eraseBtn').addEventListener('click', eraseHistory);
  byId('prepareOfflineBtn').addEventListener('click', () => prepareOffline());
  byId('refreshBtn').addEventListener('click', () => window.location.reload());
  window.addEventListener('online', updateNetworkBadge);
  window.addEventListener('offline', updateNetworkBadge);
}
async function init() {
  initEvents(); updateNetworkBadge();
  if (location.protocol === 'file:') {
    byId('matchedCount').textContent = '直接開く方式では動作しません。READMEのローカルサーバー手順をご覧ください。';
    byId('offlineMessage').textContent = 'HTTPSまたはlocalhostで開いてください。';
    return;
  }
  try {
    database = await openDatabase();
    await loadHistory();
    questions = await fetchQuestions();
    refreshFilters(); refreshStats();
    await registerWorker();
    await prepareOffline({ silent: true });
  } catch (error) {
    byId('matchedCount').textContent = `読み込みエラー: ${error.message}`;
    byId('offlineMessage').textContent = '初期化を完了できませんでした。';
    notify(error.message);
    console.error(error);
  }
}
document.addEventListener('DOMContentLoaded', init);
