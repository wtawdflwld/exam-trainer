const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
// Raw HTML is always text. Markdown never creates arbitrary attributes or HTML.
export function rich(text,q,material,onImage){
  const root=node('div');root.className='rich';const tokens=[];
  const source=text.replace(/\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g,(raw,display,inline)=>{
    const el=node(display!==undefined?'div':'span');el.className='formula';
    try{globalThis.katex.render(display??inline,el,{displayMode:display!==undefined,throwOnError:true,trust:false,strict:'error',maxExpand:1000,maxSize:20,output:'htmlAndMathml'});}
    catch{el.className='formula-error';el.textContent=raw;el.title='数式記法を確認してください';}
    tokens.push(el);return `\uE000${tokens.length-1}\uE001`;
  });
  function inline(s,parent){
    const pattern=/\uE000(\d+)\uE001|\[img:([^\]\n]+)\]|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let last=0;for(const m of s.matchAll(pattern)){
      parent.append(document.createTextNode(s.slice(last,m.index)));last=m.index+m[0].length;
      if(m[1]!==undefined){parent.append(tokens[Number(m[1])]?.cloneNode(true)||document.createTextNode(m[0]));}
      else if(m[2]){const blob=material.images?.[`images/${q.id}/${m[2]}`];
        if(blob){const img=node('img');img.src=URL.createObjectURL(blob);img.alt=m[2];img.className='question-image';img.tabIndex=0;img.setAttribute('role','button');
          const open=e=>{e.stopPropagation();e.preventDefault();onImage(blob,m[2]);};img.onclick=open;img.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')open(e);};img.onload=()=>URL.revokeObjectURL(img.src);parent.append(img);
        }else parent.append(node('span','［画像が不足しています］'));
      }else if(m[3])parent.append(node('strong',m[3]));else if(m[4])parent.append(node('em',m[4]));else if(m[5])parent.append(node('code',m[5]));
      else {const a=node('a',m[6]);a.href=m[7];a.target='_blank';a.rel='noopener noreferrer';a.onclick=e=>e.stopPropagation();parent.append(a);}
    }parent.append(document.createTextNode(s.slice(last)));
  }
  let list=null,paragraph=null;
  for(const line of source.split(/\r?\n/)){
    if(!line.trim()){list=null;paragraph=null;continue;}
    const heading=line.match(/^(#{1,3})\s+(.+)$/),bullet=line.match(/^([-*]|\d+\.)\s+(.+)$/),quote=line.match(/^>\s?(.*)$/);
    if(heading){const h=node(`h${heading[1].length+2}`);inline(heading[2],h);root.append(h);paragraph=null;list=null;}
    else if(bullet){const tag=/\d/.test(bullet[1])?'ol':'ul';if(!list||list.tagName.toLowerCase()!==tag){list=node(tag);root.append(list);}const li=node('li');inline(bullet[2],li);list.append(li);paragraph=null;}
    else if(quote){const b=node('blockquote');inline(quote[1],b);root.append(b);list=null;paragraph=null;}
    else {if(!paragraph){paragraph=node('div');paragraph.className='paragraph';root.append(paragraph);}else paragraph.append(node('br'));inline(line,paragraph);list=null;}
  }return root;
}
