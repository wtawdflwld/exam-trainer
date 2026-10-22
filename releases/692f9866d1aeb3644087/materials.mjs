import {assert,decodeCSV,imageNames,imagePath,sha256,validateExams} from './core.mjs';
export function validateCatalog(c){
  assert(c?.schema===1&&Array.isArray(c.exams));validateExams({schema:1,exams:c.exams.map(e=>({...e,csv:e.csv.path}))});
  for(const e of c.exams){assert(/^[a-f0-9]{64}$/.test(e.version)&&/^[a-f0-9]{64}$/.test(e.csv.sha256)&&Number.isInteger(e.count)&&e.count>=0&&Array.isArray(e.images));
    const names=new Set();for(const a of e.images){assert(typeof a.path==='string'&&a.path.startsWith('images/'+e.id+'-')&&!a.path.includes('..')&&!names.has(a.path)&&/^[a-f0-9]{64}$/.test(a.sha256));names.add(a.path);}
  }return c;
}
async function fetchData(path,hash){
  const url=new URL(path,document.baseURI);const r=await fetch(url,{cache:'no-store'});assert(r.ok,`取得できませんでした（HTTP ${r.status}）。`);
  const bytes=await r.arrayBuffer();if(hash)assert(await sha256(bytes)===hash,'公開中の教材と一覧が一致しません。公開完了後に再試行してください。');return bytes;
}
export async function getCatalog(){assert(navigator.onLine,'オンラインで教材一覧を取得してください。');return validateCatalog(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await fetchData('catalog.json'))));}
export async function prepareMaterial(exam,onProgress){
  assert(navigator.onLine,'オフラインでは教材を更新できません。');
  onProgress('CSVを取得しています…');const bytes=await fetchData(exam.csv.path,exam.csv.sha256);
  const csv=new TextDecoder('utf-8',{fatal:true}).decode(bytes),questions=decodeCSV(csv,exam.id);
  assert(questions.length===exam.count);
  const expected=new Set(questions.flatMap(q=>imageNames(q).map(n=>imagePath(q.id,n))));
  assert(expected.size===exam.images.length&&exam.images.every(a=>expected.has(a.path)),'教材の画像一覧が一致しません。');
  const images={};for(let i=0;i<exam.images.length;i++){
    const a=exam.images[i];onProgress(`画像を保存準備しています ${i+1} / ${exam.images.length}`);
    const raw=await fetchData(a.path,a.sha256),type=/\.png$/i.test(a.path)?'image/png':/\.webp$/i.test(a.path)?'image/webp':'image/jpeg';
    const blob=new Blob([raw],{type});const url=URL.createObjectURL(blob);
    try{await new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=()=>reject(Error('画像を読み込めません。旧教材を維持します。'));img.src=url;});}finally{URL.revokeObjectURL(url);}
    images[a.path]=blob;
  }
  onProgress('全データを確認しました。端末に保存しています…');
  return {exam:exam.id,version:exam.version,meta:exam,questions,csv,images,savedAt:new Date().toISOString()};
}
