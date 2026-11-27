const blocked=/(?:^|[\/_.-])(?:login|signin|logout|signout|delete|remove|purchase|unsubscribe|checkout|cancel|submit|download|account|admin|dashboard|settings|billing|api)(?:[\/_.-]|$)/i;
export type ResearchSource={url:string;title:string};
export function publicResearchUrl(raw:string){
 try{
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||u.href.length>450||
   !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(u.hostname)||
   /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/i.test(u.hostname)||
   blocked.test(decodeURIComponent(u.pathname))||
   /\.(zip|exe|dmg|msi|deb|apk|pdf|csv|docx?|xlsx?|xml|json)$/i.test(u.pathname))return null;
  return u.href;
 }catch{return null}
}
export function parseResearch(command:string){
 const m=/^(research|compare)\s+(.+)$/i.exec(command.trim());
 if(!m||m[2].length>450)return null;
 const urls=[...m[2].matchAll(/https:\/\/[^\s<>"']+/gi)].map(x=>x[0].replace(/[),.;]+$/,''));
 const direct=[...new Set(urls.map(publicResearchUrl).filter((x):x is string=>!!x))];
 if(urls.length!==direct.length||direct.length>3||urls.length===1)throw new Error('Provide two or three distinct public HTTPS page links, without query strings.');
 return {goal:command.trim(),query:m[2],direct:direct.map(url=>({url,title:new URL(url).hostname}))};
}
export function validateResearchSources(raw:unknown):ResearchSource[]{
 if(!Array.isArray(raw))return [];
 const sources:ResearchSource[]=[],seen=new Set<string>();
 for(const record of raw.slice(0,30)){
  if(typeof record?.url!=='string'||typeof record?.title!=='string')continue;
  const url=publicResearchUrl(record.url);
  if(!url||seen.has(url))continue;
  seen.add(url);sources.push({url,title:record.title.trim().slice(0,110)||new URL(url).hostname});
  if(sources.length===10)break;
 }
 return sources;
}

/** Injected functions must be closed over no module state. */
export function discoverResearchSources(){
 if(location.origin!=='https://www.google.com'||location.pathname!=='/search')return [];
 const out:{title:string;url:string}[]=[];
 for(const h of document.querySelectorAll<HTMLElement>('main a h3, #search a h3, a h3')){
  const link=h.closest('a');
  const rect=h.getBoundingClientRect();
  if(!link||!rect.width||!rect.height||getComputedStyle(h).visibility!=='visible'||
    h.closest('[hidden],[inert],[aria-hidden="true"],[data-text-ad],#tads,#bottomads'))continue;
  try{
   let u=new URL(link.href);
   if(u.origin==='https://www.google.com'&&u.pathname==='/url'){
    const to=u.searchParams.get('q')??u.searchParams.get('url');
    if(!to)continue;u=new URL(to);
   }
   if(u.hostname==='google.com'||u.hostname.endsWith('.google.com'))continue;
   if(u.search){
    for(const key of [...u.searchParams.keys()])if(/^utm_|^(gclid|fbclid)$/i.test(key))u.searchParams.delete(key);
   }
   u.hash='';
   out.push({title:h.innerText.replace(/\s+/g,' ').trim().slice(0,110),url:u.href});
  }catch{continue}
  if(out.length===25)break;
 }
 return out;
}

export function readResearchPage(goal:string){
 const clean=(x:string)=>x.replace(/\s+/g,' ').trim();
 const skip='form,nav,footer,aside,dialog,[role="dialog"],[contenteditable],[hidden],[inert],[aria-hidden="true"],#browser-assistant-overlay';
 const words=new Set(goal.toLowerCase().match(/[a-z0-9]{4,}/g)??[]);
 for(const word of ['research','compare','https','docs','give','with','differences','links','leave','open','pages'])words.delete(word);
 const items:{text:string;score:number;index:number}[]=[],seen=new Set<string>();
 let index=0;
 const main=document.querySelector('main,article,[role="main"]')??document.body;
 for(const el of main.querySelectorAll<HTMLElement>('h1,h2,h3,p,li,tr')){
  if(index++>=280)break;
  if(el.closest(skip)||!el.getClientRects().length||getComputedStyle(el).visibility!=='visible')continue;
  const value=el.tagName==='TR'?Array.from(el.querySelectorAll<HTMLElement>('th,td'),x=>clean(x.innerText)).slice(0,6).join(' | '):clean(el.innerText??'');
  if(value.length<8||seen.has(value))continue;
  seen.add(value);
  const lower=value.toLowerCase();
  const score=Array.from(words).filter(w=>lower.includes(w)).length*3+(el.tagName==='H1'?4:el.tagName==='H2'?1:0);
  items.push({text:value.slice(0,145),score,index});
 }
 return {url:location.href,title:clean(document.title).slice(0,110),
  text:items.sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,6).map(x=>x.text)};
}

export function researchSnapshot(sources:{text:string[]}[]){
 return {text:sources.flatMap((s,i)=>s.text.slice(0,Math.floor(12/sources.length)).map(x=>'Source '+(i+1)+': '+x)),fields:[],canScrollUp:false,canScrollDown:false};
}
