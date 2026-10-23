import {assert,pair,yearLabel,sessionLabel,compareQuestions,filterQuestions,shuffle,makeBackup,validateBackup} from './core.mjs';
import {openDB,readAll,commit} from './storage.mjs';
import {rich} from './render.mjs';
import {getCatalog,prepareMaterial,validateCatalog} from './materials.mjs';
const $=s=>document.querySelector(s), el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const APP_VERSION=document.querySelector('meta[name=app-version]').content;
let learning,materials=new Map(),catalog,view='home',settings,pending=null,saving=false,operation=false,restore=null,workerStatus=null,sw;
const main=$('#main'),notice=$('#notice');
function say(text){notice.textContent=text;notice.hidden=false;}
function clearNotice(){notice.hidden=true;notice.textContent='';}
function button(label,action,cls='secondary'){const b=el('button',label,cls);b.type='button';b.onclick=()=>guard(action);return b;}
function card(title){const c=el('section',undefined,'card');if(title)c.append(el('h2',title));return c;}
function paragraph(text,cls='muted'){return el('p',text,cls);}
function title(text,sub){const h=el('div',undefined,'page-heading');h.append(el('h1',text));if(sub)h.append(paragraph(sub));main.append(h);}
function homeLink(){if(view!=='home')main.append(button(view==='study'?'中断してホームへ':'ホームへ戻る',()=>show('home'),'back'));}
function disableBusy(){main.querySelectorAll('button,input,select').forEach(b=>b.disabled=true);}
async function guard(fn){try{await fn();}catch(e){say(e.message||'処理に失敗しました。');}}
function guardLeaving(){if(pending||saving){say('解答が未保存です。解説の下にある「保存を再試行」で保存を完了してください。');return false;}if(operation){say('データ処理が完了するまでお待ちください。');return false;}return true;}
function show(name){if(!guardLeaving())return;view=name;render();window.scrollTo(0,0);}
function render(){main.replaceChildren();homeLink();({home:renderHome,setup:renderSetup,study:renderStudy,result:renderResult,progress:renderProgress,manage:renderManage}[view])();updateBanner();}
function examMeta(id){return catalog.exams.find(e=>e.id===id)||materials.get(id)?.meta||{id,name:id,years:{},sessions:{}};}
function allExams(){const map=new Map(catalog.exams.map(e=>[e.id,e]));for(const m of materials.values())if(!map.has(m.exam))map.set(m.exam,m.meta);return [...map.values()];}
async function save(next,action){const result=await commit(learning.revision,next,action);learning=result;return result;}
function sessionProblem(){const s=learning.session;if(!s)return '';
  const m=materials.get(s.exam);if(!m)return '教材が未保存です。設定・データ管理から、この演習と同じ版の教材を取得してください。';
  if(m.version!==s.version)return '教材の版が演習開始時と異なります。記録を保持しています。元の版を再取得するか、この演習を明示的に破棄してください。';
  if(s.order.some(id=>!m.questions.some(q=>q.id===id)))return '演習に必要な問題が教材にありません。記録を保持しています。';return '';
}
function renderHome(){
  title('今日も、一問ずつ。','過去問演習 / 個人用');
  const hero=card();hero.classList.add('hero');hero.append(el('span','STUDY AT YOUR PACE','eyebrow'),el('h2','自分のペースで、\n理解を積み重ねる。'));
  hero.append(paragraph('年度と分野を選んで演習。間違えた問題は、もう一度。'));
  hero.append(button('新しく演習する →',()=>newSetup(),'primary'));main.append(hero);
  const s=learning.session;if(s){const c=card(s.phase==='result'?'前回の演習結果':'中断中の演習');const e=examMeta(s.exam);c.append(paragraph(`${e.name} · 解答済み ${s.answers.length} / ${s.order.length}問`));
    const issue=s.phase==='result'?'':sessionProblem();if(issue)c.append(paragraph(issue,'warning'));
    const resume=button(s.phase==='result'?'前回の結果を見る':'前回の続きから',()=>{if(s.phase!=='result'&&sessionProblem()){say(sessionProblem());return;}show(s.phase==='result'?'result':'study');},'primary');resume.disabled=!!issue;c.append(resume);
    c.append(button('この演習を破棄',async()=>{if(!confirm('中断演習を破棄しますか？確定済みの学習状態は残ります。'))return;await save({...learning,session:null});render();},'text-danger'));main.append(c);
  }
  const count=[...materials.values()].reduce((n,m)=>n+m.questions.length,0);
  if(!count){const c=card('教材を登録して始めましょう');c.append(paragraph('過去問はまだ登録されていません。PCでCSVと画像を配置・公開した後、教材を取得してください。'),button('教材を取得する',()=>show('manage'),'primary'));main.append(c);}
  const nav=el('div',undefined,'home-links');nav.append(button('学習進捗 →',()=>show('progress')),button('設定・データ管理 →',()=>show('manage')));main.append(nav);
}
function defaultSettings(id){const qs=materials.get(id)?.questions||[];return {exam:id,times:[...new Set(qs.map(q=>pair(q.year,q.session)))],topics:[...new Set(qs.map(q=>pair(q.category,q.subcategory)))],target:'all',order:'random'};}
function newSetup(){
  const available=[...materials.values()].filter(m=>m.questions.length);if(!available.length){show('manage');say('PCで教材を公開し、「教材を更新」で取得してください。');return;}
  const last=learning.lastSettings;settings=last&&materials.has(last.exam)?structuredClone(last):defaultSettings(available[0].exam);
  // Removed selections stay removed. Never silently broaden the previous filter.
  show('setup');
}
function groups(kind,qs,e){const g=new Map();for(const q of qs){const parent=kind==='times'?q.year:q.category,child=kind==='times'?q.session:q.subcategory;if(!g.has(parent))g.set(parent,new Set());g.get(parent).add(child);}
  return [...g.entries()].sort(([a],[b])=>kind==='times'?Number(b)-Number(a):a.localeCompare(b,'ja')).map(([p,v])=>({key:p,label:kind==='times'?yearLabel(e,p):p,children:[...v].sort((a,b)=>kind==='times'?(e.sessions[a]?.order??9999)-(e.sessions[b]?.order??9999)||a.localeCompare(b):a.localeCompare(b,'ja')).map(x=>({key:pair(p,x),label:kind==='times'?sessionLabel(e,x):x}))}));}
function selectionTree(kind,label,qs,e){
  const c=card(label),g=groups(kind,qs,e),toolbar=el('div',undefined,'toolbar');
  toolbar.append(button('すべて選択',()=>{settings[kind]=g.flatMap(p=>p.children.map(x=>x.key));renderSetupOnly();},'small'),button('すべて解除',()=>{settings[kind]=[];renderSetupOnly();},'small'),button('展開',()=>c.querySelectorAll('details').forEach(x=>x.open=true),'small'),button('折りたたみ',()=>c.querySelectorAll('details').forEach(x=>x.open=false),'small'));c.append(toolbar);
  for(const group of g){
    const d=el('details');d.open=g.length<=3;const summary=el('summary'),labelEl=el('label',undefined,'check-label'),parent=el('input');parent.type='checkbox';
    const selected=group.children.filter(x=>settings[kind].includes(x.key)).length;parent.checked=selected===group.children.length;parent.indeterminate=selected>0&&!parent.checked;
    parent.onclick=event=>event.stopPropagation();labelEl.onclick=event=>event.stopPropagation();
    parent.onchange=()=>{const set=new Set(settings[kind]);for(const child of group.children)parent.checked?set.add(child.key):set.delete(child.key);settings[kind]=[...set];renderSetupOnly();};
    labelEl.append(parent,document.createTextNode(group.label));summary.append(labelEl);d.append(summary);
    for(const child of group.children){const l=el('label',undefined,'check-label child');const input=el('input');input.type='checkbox';input.checked=settings[kind].includes(child.key);input.onchange=()=>{const set=new Set(settings[kind]);input.checked?set.add(child.key):set.delete(child.key);settings[kind]=[...set];const n=group.children.filter(x=>set.has(x.key)).length;parent.checked=n===group.children.length;parent.indeterminate=n>0&&!parent.checked;updateCount();};l.append(input,document.createTextNode(child.label));d.append(l);}c.append(d);
  }return c;
}
function renderSetupOnly(){const open=[...main.querySelectorAll('details')].map(x=>x.open);render();main.querySelectorAll('details').forEach((x,i)=>{if(open[i]!==undefined)x.open=open[i];});}
function renderSetup(){
  title('出題設定','絞り込んだ問題を、すべて出題します。');const choose=card('資格');const select=el('select');select.setAttribute('aria-label','資格');
  for(const m of materials.values())if(m.questions.length){const opt=new Option(m.meta.name,m.exam);select.add(opt);}select.value=settings.exam;select.onchange=()=>{settings=defaultSettings(select.value);render();};choose.append(select);main.append(choose);
  const m=materials.get(settings.exam);if(!m){main.append(paragraph('この資格の教材が未取得です。'));return;}const e=m.meta;
  main.append(selectionTree('times','年度・試験回',m.questions,e),selectionTree('topics','分野・細分野',m.questions,e));
  const options=card('出題方法');for(const [key,label,values] of [['target','出題対象',[['all','すべて'],['unanswered','未回答のみ'],['wrong','直近不正解のみ']]],['order','出題順序',[['random','ランダム'],['number','問題番号順']]]]){
    const field=el('fieldset');field.append(el('legend',label));for(const [value,text] of values){const l=el('label',undefined,'radio-label');const input=el('input');input.type='radio';input.name=key;input.value=value;input.checked=settings[key]===value;input.onchange=()=>{settings[key]=value;updateCount();};l.append(input,document.createTextNode(text));field.append(l);}options.append(field);
  }main.append(options);const footer=card();footer.classList.add('start-card');const count=el('p');count.id='matched';const start=button('この条件で始める →',startExercise,'primary');start.id='start';footer.append(count,start);main.append(footer);updateCount();
}
function updateCount(){const m=materials.get(settings.exam),count=m?filterQuestions(m.questions,settings,learning.states).length:0;$('#matched').textContent=`該当 ${count}問`+(count===0?(settings.target==='unanswered'?' · この条件の未回答はありません':' · 条件に一致する問題はありません'):'');$('#start').disabled=count===0;}
async function startExercise(reviewIds){
  if(operation||pending)return;let s=structuredClone(settings),m=materials.get(s.exam);
  let qs=reviewIds?m.questions.filter(q=>reviewIds.includes(q.id)):filterQuestions(m.questions,s,learning.states);if(!qs.length)return;
  if(learning.session?.phase==='study'&&!confirm('中断中の演習を破棄して、新しく開始しますか？確定済みの学習状態は残ります。'))return;
  qs=s.order==='random'?shuffle(qs):qs.slice().sort((a,b)=>compareQuestions(m.meta,a,b));
  const session={id:crypto.randomUUID(),exam:s.exam,version:m.version,order:qs.map(q=>q.id),position:0,answers:[],phase:'study',settings:s,startedAt:new Date().toISOString()};
  operation=true;disableBusy();try{await save({...learning,session,lastSettings:s});view='study';render();window.scrollTo(0,0);}finally{operation=false;render();}
}
function openImage(blob,name){const d=$('#image-dialog'),img=$('#zoom-image');if(img.dataset.url)URL.revokeObjectURL(img.dataset.url);img.src=URL.createObjectURL(blob);img.dataset.url=img.src;img.alt=name;d.showModal();}
function renderStudy(){
  const issue=sessionProblem();if(issue){title('演習を再開できません');main.append(paragraph(issue,'warning'),button('教材管理を開く',()=>show('manage'),'primary'));return;}
  const s=learning.session;if(!s){view='home';render();return;}
  const m=materials.get(s.exam),q=m.questions.find(q=>q.id===s.order[s.position]),answer=pending?.answer||s.answers[s.position];
  title(`問題 ${s.position+1} / ${s.order.length}`);const n=s.answers.length+(pending?1:0);const progress=el('progress');progress.max=s.order.length;progress.value=n;progress.setAttribute('aria-label','演習の解答済み数');
  main.append(paragraph(`解答済み ${n}問 · 残り ${s.order.length-n}問`),progress,paragraph(`${m.meta.name} / ${yearLabel(m.meta,q.year)} ${sessionLabel(m.meta,q.session)} / 問${q.number}`,'question-meta'));
  const question=card();question.append(rich(q.question,q,m,openImage));main.append(question);const choices=el('div',undefined,'choices');
  for(let i=1;i<=4;i++){const b=button('',()=>answerQuestion(i),'choice');const number=el('span',String(i),'choice-mark');const text=rich(q['option'+i],q,m,openImage);b.append(number,text);
    if(answer){b.setAttribute('aria-disabled','true');if(i===q.correct){b.classList.add('correct');b.append(el('span','✓ 正解','choice-state'));}else if(i===answer.choice){b.classList.add('incorrect');b.append(el('span','× 選択','choice-state'));}}
    choices.append(b);
  }main.append(choices);if(!answer)main.append(button('わからない',()=>answerQuestion(0),'unknown'));
  if(answer){const panel=card();panel.id='explanation';panel.classList.add('answer-panel');panel.append(el('h2',answer.correct?'✓ 正解です':`× ${answer.choice===0?'わからない':'不正解'} · 正解は ${q.correct}`,answer.correct?'good':'bad'),el('h3','解説'),rich(q.explanation||'解説は登録されていません。',q,m,openImage));
    panel.append(paragraph(saving?'解答を保存しています…':pending?'未保存です。保存が完了するまで次へ進めません。':'解答を保存しました',pending?'warning':'saved'));
    if(pending&&!saving)panel.append(button('保存を再試行',persistAnswer,'primary'));
    const next=button(s.position===s.order.length-1?'結果を見る →':'次の問題 →',nextQuestion,'primary');next.disabled=!!pending||saving;panel.append(next);main.append(panel);
  }
}
function answerQuestion(choice){
  if(operation||saving||pending)return;const s=learning.session;if(s.answers[s.position])return;
  const q=materials.get(s.exam).questions.find(q=>q.id===s.order[s.position]);const answer={id:q.id,choice,correct:choice===q.correct,at:new Date().toISOString()};
  const next=structuredClone(learning);next.session.answers.push(answer);next.states=next.states.filter(r=>r.id!==q.id);next.states.push({id:q.id,exam:s.exam,correct:answer.correct,answeredAt:answer.at});pending={answer,next};
  saving=true;render();requestAnimationFrame(()=>$('#explanation')?.scrollIntoView({block:'start',behavior:'smooth'}));return persistAnswer();
}
async function persistAnswer(){
  if(!pending)return;saving=true;render();try{await save(pending.next);pending=null;clearNotice();}catch(e){say('保存できませんでした。解説は保持しています。空き容量などを確認し、保存を再試行してください。 '+e.message);}finally{saving=false;render();}
}
async function nextQuestion(){
  if(!guardLeaving()||operation)return;const s=learning.session;if(!s.answers[s.position])return;const next=structuredClone(learning);
  if(s.position===s.order.length-1)next.session.phase='result';else next.session.position++;
  operation=true;disableBusy();try{await save(next);view=next.session.phase==='result'?'result':'study';clearNotice();render();window.scrollTo(0,0);}finally{operation=false;render();}
}
function renderResult(){
  const s=learning.session;if(!s){view='home';render();return;}title('演習完了','おつかれさまでした。');const good=s.answers.filter(a=>a.correct).length,bad=s.answers.length-good;
  const c=card('今回の結果');c.classList.add('result-card');c.append(el('div',`${Math.round(good/s.order.length*100)}%`,'result-rate'),paragraph('今回の正解率'));const stats=el('div',undefined,'stats');for(const [name,value] of [['正解',good],['不正解',bad]]){const d=el('div');d.append(el('strong',`${value}問`),el('span',name));stats.append(d);}c.append(stats);main.append(c);
  const retry=button('今回間違えた問題を復習する',async()=>{const issue=sessionProblem();assert(!issue,issue);settings=structuredClone(s.settings);await startExercise(s.answers.filter(a=>!a.correct).map(a=>a.id));},'primary');retry.disabled=bad===0||!!sessionProblem();main.append(retry);if(!bad)main.append(paragraph('今回間違えた問題はありません。'));main.append(button('ホームに戻る',()=>show('home')));
}
function renderProgress(){title('学習進捗','現在保存されている教材を資格別に集計しています。');for(const e of allExams()){
  const c=card(e.name),qs=materials.get(e.id)?.questions||[],states=new Set(learning.states.map(s=>s.id));const done=qs.filter(q=>states.has(q.id)).length,rate=qs.length?Math.round(done/qs.length*100):0;
  c.append(el('p',`${done} / ${qs.length}問 学習済み`,'progress-count'),paragraph(qs.length?`進捗 ${rate}% · 未回答 ${qs.length-done}問`:'教材未取得、または登録問題0件'));
  const progress=el('progress');progress.max=100;progress.value=rate;progress.setAttribute('aria-label',e.name+'の学習進捗');c.append(progress);main.append(c);
}}
function renderManage(){
  title('設定・データ管理','教材と学習記録は、この端末に保存されます。');
  const intro=card('教材管理');intro.append(paragraph('WindowsでCSV・画像を公開してから、資格ごとに教材を取得・更新します。'),button('資格・教材一覧を取得',async()=>{assert(guardLeaving());operation=true;disableBusy();try{const next=await getCatalog();await save(learning,{type:'put',exam:'__catalog',value:{kind:'catalog',catalog:next}});catalog=next;say('最新の資格・教材一覧を取得しました。教材本体は未更新です。');}finally{operation=false;render();}}));main.append(intro);
  for(const e of allExams()){
    const c=card(e.name),m=materials.get(e.id);c.append(paragraph(m?`保存済み ${m.questions.length}問 · 最終更新 ${new Date(m.savedAt).toLocaleString('ja-JP')}`:'未保存'),paragraph(`公開教材 ${e.count??0}問`));
    const locked=learning.session?.phase==='study'&&learning.session?.exam===e.id;const missing=locked&&(!m||m.version!==learning.session.version);
    if(locked)c.append(paragraph(!missing?'この資格の演習を保持中です。完了またはホームで破棄後に教材を変更できます。':'復元された演習を保持中です。同一版の教材だけ取得できます。','warning'));
    const update=button(m?'教材を更新':'教材を取得',()=>updateMaterial(e.id),'primary');update.disabled=!navigator.onLine||(locked&&!missing);c.append(update);
    const del=button('教材を削除',async()=>{if(!confirm(`${e.name}の保存済み教材を削除しますか？学習状態は残ります。`))return;operation=true;disableBusy();try{await save(learning,{type:'delete',exam:e.id});materials.delete(e.id);say('教材を削除しました。学習状態は保持しています。');}finally{operation=false;render();}},'text-danger');del.disabled=!m||locked;c.append(del);main.append(c);
  }
  if(!navigator.onLine)main.append(paragraph('オフラインです。教材の取得・更新は接続後に行ってください。','warning'));
  const data=card('学習データ');data.append(paragraph('バックアップには全資格の直近状態・中断演習・前回の出題設定を含みます。教材CSVと画像は含みません。'),button('バックアップを作成',exportBackup,'primary'));
  const label=el('label','バックアップJSONから復元','file-label'),input=el('input');input.type='file';input.accept='.json,application/json';input.onchange=()=>guard(async()=>{const f=input.files?.[0];input.value='';if(!f)return;assert(f.size<=50*1024*1024,'50MB以下のバックアップを選んでください。');restore=validateBackup(JSON.parse(await f.text()));render();});label.append(input);data.append(label);
  if(restore){const confirmBox=el('div',undefined,'restore-confirm');confirmBox.append(el('h3','復元前の確認'),paragraph(`${restore.states.length}件の学習状態${restore.session?'・演習状態':''}で、現在の学習データを全置換します。教材は変更しません。`,'warning'),button('先に現在の記録をバックアップ',exportBackup),button('確認して全置換する',async()=>{if(!confirm('現在の学習記録を選択したバックアップですべて置き換えます。実行しますか？'))return;operation=true;disableBusy();try{await save({...restore,revision:learning.revision});restore=null;settings=null;say('学習データを復元しました。'+(sessionProblem()||''));}finally{operation=false;render();}},'danger'),button('復元を取り消す',()=>{restore=null;render();}));data.append(confirmBox);}main.append(data);
  const app=card('アプリと保存領域');app.append(paragraph(`アプリ版 ${APP_VERSION}`),paragraph(workerStatus?.ready?'アプリ・数式・フォント：オフライン保存済み':'アプリのオフライン保存を確認しています。オンラインで再確認してください。'),button('アプリ更新を確認',()=>checkAppUpdate()),button('保存領域の維持を要求',async()=>{const ok=await navigator.storage?.persist?.();say(ok?'保存領域の維持が許可されました。':'保存領域の維持はブラウザーが判断します。定期的にJSONバックアップを保存してください。');}));
  app.append(paragraph('端末のサイトデータ消去や保存領域の回収には備えが必要です。バックアップを「ファイル」等へ保存してください。'));main.append(app);
}
async function updateMaterial(id){
  if(!guardLeaving()||operation)return;operation=true;disableBusy();
  try{
    const remote=await getCatalog(),e=remote.exams.find(e=>e.id===id);assert(e,'公開教材一覧にこの資格がありません。');
    const s=learning.session;assert(!s||s.phase==='result'||s.exam!==id||(materials.get(id)?.version!==s.version&&s.version===e.version),'中断演習と同じ版の教材ではありません。中断記録を保持しています。');
    const value=await prepareMaterial(e,text=>say(`${e.name}：${text}`));const ids=new Set(value.questions.map(q=>q.id));assert(![...materials.values()].some(m=>m.exam!==id&&m.questions.some(q=>ids.has(q.id)))&&!learning.states.some(r=>r.exam!==id&&ids.has(r.id)),'別資格と問題IDが重複するため教材を切り替えませんでした。');await save(learning,{type:'put',exam:id,value});materials.set(id,value);catalog=remote;say(`${e.name}：${value.questions.length}問を保存しました。`);
  }catch(e){say('教材更新に失敗しました。旧教材と学習状態を維持しています。 '+e.message);}finally{operation=false;render();}
}
async function exportBackup(){
  assert(guardLeaving(),'未保存の処理を完了してください。');const latest=await readAll();const b=makeBackup(latest.learning);validateBackup(b);const blob=new Blob([JSON.stringify(b,null,2)],{type:'application/json'});const file=new File([blob],`過去問演習-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,{type:'application/json'});
  if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'学習記録のバックアップ'});return;}catch(e){if(e.name==='AbortError')return;}}
  const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);say('バックアップを作成しました。保存先を確認してください。');
}
function messageWorker(type){return new Promise((resolve,reject)=>{
  let settled=false;const ports=[];
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed);for(const port of ports)port.close();error?reject(error):resolve(value);};
  const send=()=>{if(settled)return;const target=navigator.serviceWorker.controller||sw?.active;
    if(!target){finish(Error('オフライン機能を準備しています。少し待って再試行してください。'));return;}
    const channel=new MessageChannel();ports.push(channel.port1);channel.port1.onmessage=event=>event.data.error?finish(Error(event.data.error)):finish(null,event.data);
    try{target.postMessage({type},[channel.port2]);}catch(e){finish(e);}
  };
  // Prototype workers do not implement this protocol. Retry read/check after takeover.
  const changed=()=>{if(type!=='APPLY')send();};
  const timer=setTimeout(()=>finish(Error('アプリ保存処理の応答がありません。通信状態と空き容量を確認して再試行してください。')),120000);
  navigator.serviceWorker.addEventListener('controllerchange',changed);send();
});}
async function checkAppUpdate(silent=false){if(!navigator.onLine){if(!silent)say('オフラインでは保存済みのアプリを利用します。');return;}workerStatus=await messageWorker('CHECK');updateBanner();if(view==='manage')render();if(!silent)say(workerStatus.candidate&&workerStatus.candidate!==workerStatus.active?'新しいアプリが利用できます。通知から手動で適用してください。':'アプリの保存・更新確認が完了しました。');}
function updateBanner(){const b=$('#update-banner');b.replaceChildren();b.hidden=true;if(!workerStatus?.candidate||workerStatus.candidate===workerStatus.active)return;
  b.hidden=false;b.append(paragraph('新しいアプリを保存しました。適用すると再起動します。'),button('今すぐ更新',async()=>{if(!guardLeaving())return;const status=await messageWorker('STATUS');assert(status.candidate,'更新候補がありません。');await messageWorker('APPLY');location.reload();},'primary'),button('あとで',()=>{b.hidden=true;}));
}
async function init(){
  $('#network').textContent=navigator.onLine?'オンライン':'オフライン';
  try{
    assert(location.protocol!=='file:','index.htmlの直接起動には対応しません。READMEのローカル起動手順を使ってください。');
    await openDB();const stored=await readAll();learning=stored.learning;materials=new Map(stored.materials.filter(m=>m.kind!=='catalog').map(m=>[m.exam,m]));
    const cached=stored.materials.find(m=>m.kind==='catalog');catalog=cached?.catalog||validateCatalog(await (await fetch(new URL('catalog-default.json',import.meta.url))).json());render();
    if('serviceWorker' in navigator){
      sw=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});await navigator.serviceWorker.ready;
      workerStatus=await messageWorker('STATUS');if(view==='manage')render();updateBanner();
      if(navigator.onLine)await checkAppUpdate(true);
    }else say('この環境ではオフライン機能が利用できません。');
  }catch(e){say(e.message);if(!learning){main.replaceChildren();title('起動を完了できませんでした');main.append(paragraph('保存領域や起動URLを確認してから再試行してください。'),button('再読み込み',()=>location.reload(),'primary'));}}
}
$('#close-image').onclick=()=>$('#image-dialog').close();$('#image-dialog').onclose=()=>{const i=$('#zoom-image');if(i.dataset.url)URL.revokeObjectURL(i.dataset.url);i.removeAttribute('src');delete i.dataset.url;};
for(const event of ['online','offline'])window.addEventListener(event,()=>{$('#network').textContent=navigator.onLine?'オンライン':'オフライン';if(view==='manage'&&!operation)render();});
window.addEventListener('beforeunload',event=>{if(pending||saving||operation){event.preventDefault();event.returnValue='';}});
init();
