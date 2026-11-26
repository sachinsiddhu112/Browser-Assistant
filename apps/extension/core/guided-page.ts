// Functions passed to the MV3 scripting API must not close over module state.
export function readGuidedViewport(){
 const visible=(el:Element)=>{
  const r=el.getBoundingClientRect(), style=getComputedStyle(el);
  return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&
   style.visibility==='visible'&&style.opacity!=='0'&&!el.closest('[hidden],[inert],[aria-hidden="true"],#browser-assistant-overlay');
 };
 const clean=(s:string)=>s.replace(/\s+/g,' ').trim().slice(0,160);
 const text:string[]=[], fields:string[]=[];
 for(const el of document.querySelectorAll<HTMLElement>('main h1, main h2, main h3, main p, article h1, article h2, article h3, article p, body > h1, body > h2, body > h3, body > p')){
  if(!visible(el)||el.closest('form,[contenteditable],dialog,[role="dialog"]'))continue;
  const value=clean(el.innerText??'');
  if(value&&!text.includes(value))text.push(value);
  if(text.length===20)break;
 }
 for(const el of document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea')){
  if(!visible(el)||el.disabled||el.readOnly||!['text','textarea','search','url','tel','email','number'].includes(el.type))continue;
  const label=clean(el.getAttribute('aria-label')||Array.from(el.labels??[],x=>x.innerText).join(' ')||el.placeholder);
  const markers=[label,el.name,el.autocomplete].join(' ');
  if(!label||/(pass(word|code)|\bpin\b|one.time|\botp\b|secret|token|ssn|social.security|\bcc-|credit.card|bank.account|routing.number|api.key)/i.test(markers))continue;
  fields.push(label);
  if(fields.length===16)break;
 }
 const root=document.scrollingElement;
 return {text,fields,canScrollUp:(root?.scrollTop??0)>1,canScrollDown:!!root&&root.scrollTop+root.clientHeight<root.scrollHeight-1};
}

export function scrollGuidedViewport(direction:'up'|'down'){
 const root=document.scrollingElement;
 if(!root)return false;
 const before=root.scrollTop;
 root.scrollTo({top:before+(direction==='down'?1:-1)*Math.max(100,Math.round(innerHeight*.75)),behavior:'instant'});
 return Math.abs(root.scrollTop-before)>1;
}
