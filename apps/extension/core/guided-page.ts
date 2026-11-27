// Functions passed to the MV3 scripting API must not close over module state.
export function readGuidedViewport(action?:
 {type:'fill';items:{id:string;label:string;value:string}[]}|
 {type:'link';id:string;label:string;url:string}|
 {type:'expand';id:string;label:string}
){
 const visible=(el:Element)=>{
  const r=el.getBoundingClientRect(), style=getComputedStyle(el);
  return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&
   style.visibility==='visible'&&style.opacity!=='0'&&!el.closest('[hidden],[inert],[aria-hidden="true"],#browser-assistant-overlay');
 };
 const store=globalThis as typeof globalThis & {__browserAssistantReviewedIds?:WeakMap<Element,string>};
 const ids=store.__browserAssistantReviewedIds??=new WeakMap<Element,string>();
 const id=(el:Element)=>{const old=ids.get(el);if(old)return old;const value=crypto.randomUUID();ids.set(el,value);return value};
 const clean=(s:string)=>s.replace(/\s+/g,' ').trim().slice(0,160);
 const text:string[]=[];
 const fields:{id:string;label:string;el:HTMLInputElement|HTMLTextAreaElement}[]=[];
 const links:{id:string;label:string;url:string}[]=[];
 for(const el of document.querySelectorAll<HTMLElement>('main h1, main h2, main h3, main p, article h1, article h2, article h3, article p, body > h1, body > h2, body > h3, body > p')){
  if(!visible(el)||el.closest('form,[contenteditable],dialog,[role="dialog"]'))continue;
  const value=clean(el.innerText??'');
  if(value&&!text.includes(value))text.push(value);
  if(text.length===20)break;
 }
 const eligibleLabel=(el:HTMLInputElement|HTMLTextAreaElement)=>{
  if(!el.isConnected||!visible(el)||el.matches(':disabled,[aria-disabled="true"]')||el.readOnly||el.value!==''||!['text','textarea','search','url','tel','email','number'].includes(el.type))return null;
  const label=clean(el.getAttribute('aria-label')||Array.from(el.labels??[],x=>x.innerText).join(' ')||el.placeholder);
  const markers=[label,el.name,el.autocomplete].join(' ');
  if(!label||/(pass(word|code)|\bpin\b|one.time|\botp\b|secret|token|ssn|social.security|\bcc-|credit.card|bank.account|routing.number|api.key)/i.test(markers))return null;
  if(el.form){
   if(el.form.querySelector('input[type="password"],input[autocomplete="one-time-code"],input[autocomplete^="cc-"]'))return null;
   const action=el.form.getAttribute('action');
   const target=new URL(action||location.href,document.baseURI);
   if(target.origin!==location.origin)return null;
  }
  return label;
 };
 for(const el of document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea')){
  const label=eligibleLabel(el);
  if(!label)continue;
  fields.push({id:id(el),label,el});
  if(fields.length===16)break;
 }
 for(const el of document.querySelectorAll<HTMLAnchorElement>('a[href]')){
  if(!visible(el)||el.hasAttribute('download')||el.matches('[aria-disabled="true"]')||el.closest('form,[role="dialog"],dialog'))continue;
  let u:URL;try{u=new URL(el.href)}catch{continue}
  const label=clean(el.getAttribute('aria-label')||el.innerText);
  if(!label||u.protocol!=='https:'||u.origin!==location.origin||u.username||u.password||u.search||u.hash||u.href===location.href||u.href.length>1200||/(^|[\/_.-])(logout|signout|delete|remove|purchase|unsubscribe|checkout|cancel|submit|download)([\/_.-]|$)/i.test(u.pathname))continue;
  links.push({id:id(el),label,url:u.href});
  if(links.length===12)break;
 }
 if(action?.type==='link'){
  if(!links.some(l=>l.id===action.id&&l.label===action.label&&l.url===action.url))throw new Error('The approved link changed or is no longer visible');
  return {kind:'link' as const,url:action.url};
 }
 if(action?.type==='fill'){
  // Preflight the whole draft; then recheck a field before writing to it.
  const selected=action.items.map(item=>{
   const field=fields.find(f=>f.id===item.id&&f.label===item.label);
   if(!field||!item.value.trim()||item.value.length>160||
     (field.el.maxLength>=0&&item.value.length>field.el.maxLength)||
     (field.el.type==='number'&&!/^-?\d+(?:\.\d+)?$/.test(item.value)))throw new Error('A reviewed field changed or cannot accept this value');
   return {el:field.el,label:item.label,value:item.value};
  });
  let count=0;
  for(const {el,label,value} of selected){
   if(eligibleLabel(el)!==label)break;
   const proto=el instanceof HTMLInputElement?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;
   const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
   if(!setter)break;
   setter.call(el,value);
   if(el.value!==value){setter.call(el,'');break}
   el.dispatchEvent(new Event('input',{bubbles:true}));
   if(!el.isConnected||el.value!==value)break;
   count++;
  }
  return {kind:'filled' as const,count};
 }
 // Only native HTML disclosures, not site-provided button handlers or form submits.
 const disclosures=Array.from(document.querySelectorAll('details:not([open]) > summary:first-of-type'))
  .filter(el=>visible(el)&&!el.closest('form,[contenteditable],dialog,[role="dialog"]'))
  .map(el=>({el,id:id(el),label:clean((el as HTMLElement).innerText??'')})).filter(x=>!!x.label).slice(0,8);
 if(action?.type==='expand'){
  const found=disclosures.find(x=>x.id===action.id&&x.label===action.label)?.el.parentElement;
  if(!(found instanceof HTMLDetailsElement)||!found.isConnected||found.open)throw new Error('The disclosure is no longer available');
  found.open=true;
  return {kind:'expanded' as const,opened:found.isConnected&&found.open};
 }
 const root=document.scrollingElement;
 return {kind:'snapshot' as const,text,disclosures:disclosures.map(({id,label})=>({id,label})),fields:fields.map(({id,label})=>({id,label})),links,canScrollUp:(root?.scrollTop??0)>1,canScrollDown:!!root&&root.scrollTop+root.clientHeight<root.scrollHeight-1};
}
