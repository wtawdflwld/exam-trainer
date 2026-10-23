import {freshLearning,assert} from './core.mjs';
// One learning record makes answer + session and full restoration atomic.
const DB_NAME='personal-exam-pwa:'+new URL('./',document.baseURI).pathname;
let db;
export async function openDB(){
  db=await new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>{for(const name of ['learning','materials'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name);};
    r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('他の画面を閉じてから再起動してください。'));r.onsuccess=()=>resolve(r.result);
  }); db.onversionchange=()=>db.close();return db;
}
function transaction(names,mode,work){return new Promise((resolve,reject)=>{
  const tx=db.transaction(names,mode);let result;let failure;
  tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(failure||tx.error||Error('端末への保存に失敗しました。'));
  try{work(tx,v=>{result=v;},error=>{failure=error;tx.abort();});}catch(e){failure=e;tx.abort();}
});}
export async function readAll(){return transaction(['learning','materials'],'readonly',(tx,set)=>{
  const out={};const a=tx.objectStore('learning').get('current');const b=tx.objectStore('materials').getAll();
  a.onsuccess=()=>{out.learning=a.result||freshLearning();set(out);};b.onsuccess=()=>{out.materials=b.result;set(out);};
});}
export async function commit(expected,learning,materialAction){return transaction(['learning','materials'],'readwrite',(tx,set,fail)=>{
  const s=tx.objectStore('learning'),r=s.get('current');r.onsuccess=()=>{try{
    const old=r.result||freshLearning();assert(old.revision===expected,'他のタブで記録が変わりました。この画面を再読み込みしてください。未保存の解答は再試行前に確認してください。');
    if(materialAction){
      const a=materialAction;
      assert(!old.session||old.session.phase==='result'||old.session.exam!==a.exam||(a.type==='put'&&old.session.version===a.value.version),'中断中の演習がこの教材を使用しています。演習を完了するか、ホームで明示的に破棄してください。');
      if(a.type==='put')tx.objectStore('materials').put(a.value,a.exam);else tx.objectStore('materials').delete(a.exam);
    }
    const next={...structuredClone(learning||old),revision:old.revision+1};s.put(next,'current');set(next);
  }catch(e){fail(e);}};
});}
