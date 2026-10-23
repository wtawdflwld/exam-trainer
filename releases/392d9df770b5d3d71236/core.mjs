export const HEADERS = 'id,exam,year,session,number,category,subcategory,question,option1,option2,option3,option4,correct,explanation'.split(',');
export const ID = /^[a-z][a-z0-9-]{0,95}$/;
export const QID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;
export const SESSION = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
export const IMAGE = /^[A-Za-z0-9][A-Za-z0-9_.-]*\.(png|jpe?g|webp)$/i;
export function assert(ok, message='データ形式を読み込めません。') { if (!ok) throw Error(message); }
export function parseCSV(text) {
  text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  const rows=[]; let row=[],cell='',quoted=false,closed=false;
  const end=()=>{ row.push(cell); if(row.some(x=>x.trim()))rows.push(row); row=[];cell='';closed=false; };
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted) { if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c; }
    else if(c===','){row.push(cell);cell='';closed=false;}
    else if(c==='\n')end();
    else if(c==='"'){assert(!cell&&!closed);quoted=true;}
    else {assert(!closed);cell+=c;}
  }
  assert(!quoted);if(cell||row.length||closed)end(); return rows;
}
export function imageNames(q) {
  const names=new Set();
  for(const k of ['question','option1','option2','option3','option4','explanation']) {
    const text=q[k]; let count=0;
    for(const m of text.matchAll(/\[img:([^\]\n]*)\]/g)){assert(IMAGE.test(m[1])&&!m[1].includes('..'),'画像指定を読み込めません。');names.add(m[1]);count++;}
    assert((text.match(/\[img:/g)||[]).length===count,'画像指定を読み込めません。');
  }
  return [...names];
}
export const imagePath=(id,name)=>`images/${id}/${name}`;
export function decodeCSV(csv, exam) {
  const rows=parseCSV(csv);assert(rows.length&&JSON.stringify(rows[0])===JSON.stringify(HEADERS),'CSVの列構成を読み込めません。');
  const used=new Set();return rows.slice(1).map(row=>{
    assert(row.length===HEADERS.length);const q=Object.fromEntries(HEADERS.map((h,i)=>[h,row[i]]));
    for(const h of HEADERS)if(!['question','option1','option2','option3','option4','explanation'].includes(h))q[h]=q[h].trim();
    assert(QID.test(q.id)&&q.id.startsWith(exam+'-')&&!used.has(q.id));used.add(q.id);
    assert(q.exam===exam&&/^\d{4}$/.test(q.year)&&Number(q.year)>=1900&&Number(q.year)<=2199&&SESSION.test(q.session));
    assert(/^[1-9]\d{0,4}$/.test(q.number)&&/^[1-4]$/.test(q.correct));
    assert(['category','subcategory','question','option1','option2','option3','option4'].every(k=>q[k].trim()));
    q.correct=Number(q.correct);q.number=Number(q.number);imageNames(q);return q;
  });
}
export function validateExams(config) {
  assert(config?.schema===1&&Array.isArray(config.exams));const ids=new Set();
  for(const e of config.exams){
    assert(ID.test(e.id)&&!ids.has(e.id)&&typeof e.name==='string'&&e.name.trim());ids.add(e.id);
    assert(e.csv===`data/${e.id}.csv`&&e.sessions&&typeof e.sessions==='object'&&!Array.isArray(e.sessions));
    assert(e.years&&typeof e.years==='object'&&!Array.isArray(e.years));
    for(const [key,v] of Object.entries(e.sessions))assert(SESSION.test(key)&&typeof v.label==='string'&&v.label.trim()&&Number.isFinite(v.order));
    for(const [key,v] of Object.entries(e.years))assert(/^\d{4}$/.test(key)&&typeof v==='string'&&v.trim());
  }return config;
}
export const pair=(a,b)=>JSON.stringify([String(a),b]);
export const yearLabel=(e,y)=>e.years?.[y]||`${y}年度`;
export const sessionLabel=(e,s)=>e.sessions?.[s]?.label||s;
export const sessionOrder=(e,s)=>e.sessions?.[s]?.order??9999;
export function compareQuestions(e,a,b){return Number(b.year)-Number(a.year)||sessionOrder(e,a.session)-sessionOrder(e,b.session)||a.session.localeCompare(b.session)||a.number-b.number||a.id.localeCompare(b.id);}
export function filterQuestions(qs,settings,states){
  const times=new Set(settings.times),topics=new Set(settings.topics),state=new Map(states.map(s=>[s.id,s]));
  return qs.filter(q=>times.has(pair(q.year,q.session))&&topics.has(pair(q.category,q.subcategory))&&(settings.target==='all'||(settings.target==='unanswered'&&!state.has(q.id))||(settings.target==='wrong'&&state.get(q.id)?.correct===false)));
}
export function shuffle(items){const a=items.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export const freshLearning=()=>({revision:0,states:[],session:null,lastSettings:null});
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(o,keys)=>obj(o)&&Object.keys(o).sort().join(',')===keys.slice().sort().join(',');
const timestamp=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT/.test(x)&&Number.isFinite(Date.parse(x));
function validateSettings(s){
  assert(exact(s,['exam','times','topics','target','order'])&&ID.test(s.exam));
  assert(['all','unanswered','wrong'].includes(s.target)&&['random','number'].includes(s.order));
  for(const key of ['times','topics']){
    assert(Array.isArray(s[key])&&s[key].length<=100000&&new Set(s[key]).size===s[key].length);
    for(const v of s[key]){assert(typeof v==='string');let a;try{a=JSON.parse(v);}catch{throw Error('出題設定の形式が不正です。');}
      assert(Array.isArray(a)&&a.length===2&&a.every(x=>typeof x==='string'&&x.length>0)&&pair(a[0],a[1])===v);
      if(key==='times')assert(/^\d{4}$/.test(a[0])&&SESSION.test(a[1]));
    }
  }
}
export function validateBackup(b){
  assert(exact(b,['format','schema','createdAt','learning'])&&b.format==='personal-exam-pwa'&&b.schema===1&&timestamp(b.createdAt),'対応していないバックアップ形式です。');
  const l=b.learning;assert(exact(l,['states','session','lastSettings'])&&Array.isArray(l.states)&&l.states.length<=1000000);
  const ids=new Set(),stateMap=new Map();for(const s of l.states){assert(exact(s,['id','exam','correct','answeredAt'])&&QID.test(s.id)&&ID.test(s.exam)&&s.id.startsWith(s.exam+'-')&&typeof s.correct==='boolean'&&timestamp(s.answeredAt)&&!ids.has(s.id));ids.add(s.id);stateMap.set(s.id,s);}
  if(l.lastSettings!==null)validateSettings(l.lastSettings);
  if(l.session!==null){
    const s=l.session;assert(exact(s,['id','exam','version','order','position','answers','phase','settings','startedAt']));
    assert(typeof s.id==='string'&&s.id.length>0&&s.id.length<100&&ID.test(s.exam)&&/^[a-f0-9]{64}$/.test(s.version)&&timestamp(s.startedAt));
    validateSettings(s.settings);assert(s.settings.exam===s.exam);
    assert(Array.isArray(s.order)&&s.order.length>0&&s.order.length<=100000&&new Set(s.order).size===s.order.length&&s.order.every(id=>typeof id==='string'&&QID.test(id)&&id.startsWith(s.exam+'-')));
    assert(Number.isInteger(s.position)&&s.position>=0&&s.position<s.order.length&&['study','result'].includes(s.phase));
    assert(Array.isArray(s.answers)&&s.answers.length>=s.position&&s.answers.length<=s.position+1);
    if(s.phase==='result')assert(s.answers.length===s.order.length&&s.position===s.order.length-1);
    for(let i=0;i<s.answers.length;i++){const a=s.answers[i];assert(exact(a,['id','choice','correct','at'])&&a.id===s.order[i]&&Number.isInteger(a.choice)&&a.choice>=0&&a.choice<=4&&typeof a.correct==='boolean'&&(a.choice!==0||!a.correct)&&timestamp(a.at));
      const state=stateMap.get(a.id);assert(state&&state.exam===s.exam&&state.correct===a.correct&&state.answeredAt===a.at);
    }
  }
  return structuredClone(l);
}
export function makeBackup(learning){return {format:'personal-exam-pwa',schema:1,createdAt:new Date().toISOString(),learning:{states:learning.states,session:learning.session,lastSettings:learning.lastSettings}};}
export async function sha256(data){const bytes=typeof data==='string'?new TextEncoder().encode(data):data;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
