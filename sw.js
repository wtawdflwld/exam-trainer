/* Stable dispatcher. Approved app version is independent of worker lifecycle. */
const BASE=new URL('./',self.location.href),PREFIX='exam-shell:'+BASE.pathname+':',CONTROL=PREFIX+'control',STATE=new URL('__app_control__',BASE).href;
let checking;let queue=Promise.resolve();
function exclusive(work){const next=queue.then(work);queue=next.catch(()=>{});return next;}
const url=p=>new URL(p,BASE).href;
async function readState(){const c=await caches.open(CONTROL),r=await c.match(STATE);return r?await r.json():{active:null,candidate:null};}
async function writeState(s){const c=await caches.open(CONTROL);await c.put(STATE,new Response(JSON.stringify(s),{headers:{'Content-Type':'application/json'}}));}
async function hash(raw){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function complete(version){if(!version)return false;const c=await caches.open(PREFIX+version);return !!await c.match(url('__complete__'));}
async function prepare(){
  if(checking)return checking;
  checking=exclusive(async()=>{
    const r=await fetch(url('app-release.json'),{cache:'no-store'});if(!r.ok)throw Error('アプリ更新情報を取得できません。');const release=await r.json();
    if(!/^[a-f0-9]{20}$/.test(release.version)||!Array.isArray(release.files)||!release.files.length)throw Error('アプリ更新情報が不正です。');
    const name=PREFIX+release.version,c=await caches.open(name);const before=await readState();
    if(!await complete(release.version)){
      try{
        for(const file of release.files){
          if(typeof file.path!=='string'||file.path.includes('..')||file.path.startsWith('/')||!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('アプリ資源一覧が不正です。');
          const response=await fetch(url(file.path),{cache:'no-store'});if(!response.ok||await hash(await response.clone().arrayBuffer())!==file.sha256)throw Error('アプリの全資源を保存できません。公開完了後に再試行してください。');
          await c.put(url(file.path),response);
        }
        await c.put(url('__complete__'),new Response('ok'));
      }catch(e){if(before.active!==release.version)await caches.delete(name);throw e;}
    }
    // Reread after downloading so a concurrent APPLY is never overwritten.
    const state=await readState();if(!state.active)state.active=release.version;state.candidate=state.active===release.version?null:release.version;await writeState(state);return {...state,ready:await complete(state.active)};
  });try{return await checking;}finally{checking=null;}
}
self.addEventListener('install',event=>event.waitUntil((async()=>{await prepare();await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>event.waitUntil((async()=>{
  try{let state;if(event.data.type==='CHECK')state=await prepare();else if(event.data.type==='APPLY'){
    state=await exclusive(async()=>{const next=await readState();if(!next.candidate||!await complete(next.candidate))throw Error('新版の保存が完了していません。');next.active=next.candidate;next.candidate=null;await writeState(next);return next;});
  }else state=await readState();event.ports[0]?.postMessage({...state,ready:await complete(state.active)});
  }catch(error){event.ports[0]?.postMessage({error:error.message});}
})()));
self.addEventListener('fetch',event=>{
  const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==BASE.origin||!u.pathname.startsWith(BASE.pathname))return;
  if(event.request.mode==='navigate')event.respondWith((async()=>{const state=await readState();if(state.active){const c=await caches.open(PREFIX+state.active),r=await c.match(url('index.html'));if(r)return r;}
    return fetch(event.request);
  })());
  else if(u.pathname.startsWith(new URL('releases/',BASE).pathname))event.respondWith((async()=>{
    const version=u.pathname.slice(new URL('releases/',BASE).pathname.length).split('/')[0];const c=await caches.open(PREFIX+version),r=await c.match(event.request,{ignoreSearch:true});return r||fetch(event.request);
  })());
  // catalog/CSV/images deliberately bypass shell caching. Material commit is in IndexedDB.
});
