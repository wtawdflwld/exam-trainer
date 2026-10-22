import {readFile,writeFile,mkdir,readdir,copyFile,stat} from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {validateExams,decodeCSV,imageNames,imagePath,assert} from '../web/core.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'dist');
const hash=x=>createHash('sha256').update(x).digest('hex');
const utf8=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
async function walk(dir){const found=[];for(const name of (await readdir(dir)).sort()){const full=path.join(dir,name);if((await stat(full)).isDirectory())for(const sub of await walk(full))found.push(name+'/'+sub);else found.push(name);}return found;}
const config=validateExams(JSON.parse(utf8(await readFile(path.join(root,'data/exams.json'))))),exams=[],globalIds=new Set();
for(const e of config.exams){const bytes=await readFile(path.join(root,e.csv)),qs=decodeCSV(utf8(bytes),e.id),images=[];
  for(const q of qs){assert(!globalIds.has(q.id),'資格間で問題IDが重複しています。');globalIds.add(q.id);}
  for(const q of qs)for(const name of imageNames(q)){const relative=imagePath(q.id,name);const bytes=await readFile(path.join(root,relative));images.push({path:relative,sha256:hash(bytes)});}
  for(const q of qs)assert(e.sessions[q.session],`data/exams.json に試験回 ${q.session} を定義してください。`);
  images.sort((a,b)=>a.path.localeCompare(b.path));const entry={...e,csv:{path:e.csv,sha256:hash(bytes)},images,count:qs.length};entry.version=hash(JSON.stringify(entry));exams.push(entry);
}
const catalog=JSON.stringify({schema:1,exams},null,2),sourceFiles=(await walk(path.join(root,'web'))).filter(n=>!['index.html','sw.js'].includes(n));
const contents=new Map();for(const name of sourceFiles)contents.set(name,await readFile(path.join(root,'web',name)));contents.set('catalog-default.json',Buffer.from(catalog));
const manifest=JSON.stringify({name:'過去問演習',short_name:'過去問演習',lang:'ja',start_url:'../../',scope:'../../',display:'standalone',background_color:'#f7f8f4',theme_color:'#f7f8f4',icons:[{src:'icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'}]},null,2);contents.set('manifest.webmanifest',Buffer.from(manifest));
const template=await readFile(path.join(root,'web/index.html'),'utf8');const version=hash(Buffer.concat([Buffer.from(template),...Array.from(contents.values()),await readFile(path.join(root,'web/sw.js'))])).slice(0,20);
const releaseDir=path.join(out,'releases',version);await mkdir(releaseDir,{recursive:true});const files=[];
for(const [name,bytes] of contents){const target=path.join(releaseDir,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);files.push({path:`releases/${version}/${name}`,sha256:hash(bytes)});}
const html=template.replaceAll('__VERSION__',version);await writeFile(path.join(out,'index.html'),html);files.push({path:'index.html',sha256:hash(html)});
await copyFile(path.join(root,'web/sw.js'),path.join(out,'sw.js'));await writeFile(path.join(out,'catalog.json'),catalog);await writeFile(path.join(out,'.nojekyll'),'');
for(const e of exams){const target=path.join(out,e.csv.path);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,e.csv.path),target);
  for(const image of e.images){const target=path.join(out,image.path);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,image.path),target);}
}
await writeFile(path.join(out,'app-release.json'),JSON.stringify({schema:1,version,files},null,2));
console.log(`Built dist: app ${version}, ${exams.length} exams, ${exams.reduce((n,e)=>n+e.count,0)} questions. No existing source or learning data deleted.`);
