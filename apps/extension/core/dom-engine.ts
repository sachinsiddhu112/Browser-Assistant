import {Action} from '@browser-assistant/shared';
const selector='a[href],button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]';
function visible(el:HTMLElement){const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility==='visible'&&s.display!=='none'&&!el.closest('[hidden],[inert],[aria-hidden="true"]')}
function sensitive(el:HTMLElement){return !!el.closest('input[type="password"],input[type="file"],[autocomplete*="cc-"],[autocomplete*="password"],[autocomplete="one-time-code"]')}
export function createEngine(){
 let snapshotId='',url='',elements:HTMLElement[]=[];
 function observe(){
  snapshotId=crypto.randomUUID();url=location.href;
  elements=Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(e=>visible(e)&&!sensitive(e)&&!e.matches(':disabled,[aria-disabled="true"]')).slice(0,150);
  return {snapshotId,url,title:document.title.slice(0,200),elements:elements.map((e,id)=>({id,tag:e.tagName.toLowerCase(),role:e.getAttribute('role')??'',label:(e.getAttribute('aria-label')??e.getAttribute('placeholder')??e.textContent??'').trim().slice(0,160)}))};
 }
 function execute(raw:unknown){
  const a=Action.parse(raw);
  if(a.type==='scroll'){const before=window.scrollY;window.scrollBy(0,a.direction==='down'?innerHeight*.8:-innerHeight*.8);return {ok:true,changed:window.scrollY!==before}}
  if(a.type!=='click'&&a.type!=='type')throw new Error('Unsupported DOM action');
  const e=elements[a.elementId];
  if(a.snapshotId!==snapshotId||url!==location.href||!e?.isConnected||!visible(e)||sensitive(e)||e.matches(':disabled,[aria-disabled="true"]'))throw new Error('Stale or unsafe element');
  // Generic clicks are not authorized yet; only a later skill policy may enable them.
  if(a.type==='click')throw new Error('Click requires an authorized skill');
  // Typing is restricted to explicit search inputs; never submit implicitly.
  if(!(e instanceof HTMLInputElement)||e.type!=='search'||e.form?.method.toLowerCase()==='post')throw new Error('Only search inputs are supported');
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
  if(!setter)throw new Error('Input setter unavailable');
  setter.call(e,a.text);e.dispatchEvent(new Event('input',{bubbles:true}));return {ok:e.value===a.text};
 }
 return {observe,execute};
}
