import {z} from 'zod';

const Name=z.string().trim().max(80);
export const Profile=z.object({
 firstName:Name,
 lastName:Name,
 email:z.union([z.literal(''),z.string().trim().email().max(120)]),
 phone:z.string().trim().max(35).regex(/^(?:|\+?[0-9 ()-]{7,35})$/).refine(x=>!x||/^\d{7,15}$/.test(x.replace(/\D/g,'')),'Enter a valid phone number'),
}).strict();
export type Profile=z.infer<typeof Profile>;
export const emptyProfile:Profile={firstName:'',lastName:'',email:'',phone:''};
export const ProfileSlot=z.enum(['firstName','lastName','fullName','email','phone']);
export const ProfileTarget=z.object({id:z.string().uuid(),label:z.string().trim().min(1).max(160),slot:ProfileSlot,formId:z.string().uuid(),action:z.string().url(),method:z.enum(['get','post'])}).strict();
export type ProfileTarget=z.infer<typeof ProfileTarget>;
export const ProfileValuesKey='assistant.contactProfile.v1';

export function matchSavedDetails(profile:Profile, fields:ProfileTarget[]){
 const forms=new Map<string,ProfileTarget[]>();
 for(const field of fields)forms.set(field.formId,[...(forms.get(field.formId)??[]),field]);
 const input={...profile,fullName:[profile.firstName,profile.lastName].filter(Boolean).join(' ')};
 const matches=[...forms.values()].map(form=>form.filter(field=>input[field.slot]&&form.filter(x=>x.slot===field.slot).length===1));
 const eligible=matches.filter(x=>x.length);
 if(eligible.length!==1)return [];
 const fieldsForForm=eligible[0];
 return fieldsForForm
  .filter(f=>f.slot==='fullName'?!fieldsForForm.some(x=>x.slot==='firstName'||x.slot==='lastName'):true)
  .map(field=>({...field,value:input[field.slot]}));
}

/** Injected in the isolated world. Values are never read from the page. */
export function inspectProfileForm(approved?:Array<{id:string;label:string;slot:string;formId:string;action:string;method:string;value:string}>){
 const scope=globalThis as typeof globalThis & {__assistantProfileNodes?:WeakMap<Element,string>};
 const ids=scope.__assistantProfileNodes??=new WeakMap();
 const id=(el:Element)=>{let v=ids.get(el);if(!v){v=crypto.randomUUID();ids.set(el,v)}return v};
 const clean=(s:string)=>s.replace(/\s+/g,' ').trim().slice(0,160);
 const labels:Record<string,string>={
  'first name':'firstName','given name':'firstName','last name':'lastName','family name':'lastName',surname:'lastName',
  'full name':'fullName',name:'fullName','your name':'fullName','candidate name':'fullName',
  'email':'email','e mail':'email','email address':'email','e mail address':'email',
  'phone':'phone','phone number':'phone','mobile':'phone','mobile number':'phone','contact number':'phone','telephone':'phone',
 };
 const auto:Record<string,string>={'given-name':'firstName','family-name':'lastName',name:'fullName',email:'email',tel:'phone'};
 function inspect(el:HTMLInputElement){
  if(!el.isConnected||!el.form||el.matches(':disabled,[aria-disabled="true"]')||el.readOnly||el.value||!['text','email','tel'].includes(el.type))return;
  if(!el.getClientRects().length||getComputedStyle(el).visibility!=='visible'||el.closest('[hidden],[inert],[aria-hidden="true"],dialog,[role="dialog"]'))return;
  const form=el.form;
  if(form.querySelector('input[type="password"],input[autocomplete="one-time-code"],input[autocomplete^="cc-"]'))return;
  let action:URL;try{action=new URL(form.action||location.href)}catch{return}
  if(action.protocol!=='https:'||action.origin!==location.origin||action.username||action.password||form.method==='dialog')return;
  const aria=el.getAttribute('aria-labelledby')?.split(/\s+/).map(x=>document.getElementById(x)?.textContent??'').join(' ');
  const label=clean(el.getAttribute('aria-label')||aria||Array.from(el.labels??[],x=>x.innerText).join(' '));
  const key=label.toLowerCase().replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();
  const slot=Object.hasOwn(labels,key)?labels[key]:undefined;
  if(!slot)return;
  const token=el.autocomplete.trim().split(/\s+/).at(-1)??'';
  if(token&&token!=='on'&&token!=='off'&&(!Object.hasOwn(auto,token)||auto[token]!==slot))return;
  if((el.type==='email'&&slot!=='email')||(el.type==='tel'&&slot!=='phone'))return;
  return {id:id(el),label,slot,formId:id(form),action:action.href,method:form.method,el};
 }
 const list=Array.from(document.querySelectorAll<HTMLInputElement>('input')).slice(0,260)
  .flatMap(el=>{const field=inspect(el);return field?[field]:[]}).slice(0,30);
 if(!approved)return {kind:'profile-fields' as const,fields:list.map(({el,...x})=>x)};
 if(!approved.length||approved.length>8||new Set(approved.map(item=>item.formId)).size!==1)return {kind:'profile-filled' as const,count:0};
 const targets=approved.map(item=>{
  const target=list.find(f=>f.id===item.id&&f.label===item.label&&f.formId===item.formId&&f.action===item.action&&f.method===item.method&&f.slot===item.slot);
  if(!target||!item.value||item.value.length>160||(target.el.maxLength>=0&&item.value.length>target.el.maxLength))return null;
  return {target,value:item.value};
 });
 if(targets.some(x=>!x))return {kind:'profile-filled' as const,count:0};
 const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
 let count=0;
 for(const x of targets){
  if(!x||!setter)break;
  const {target,value}=x;
  const current=inspect(target.el);
  if(!current||current.id!==target.id||current.label!==target.label||current.action!==target.action||current.formId!==target.formId||current.method!==target.method||current.slot!==target.slot)break;
  setter.call(target.el,value);
  if(target.el.value!==value){setter.call(target.el,'');break}
  target.el.dispatchEvent(new Event('input',{bubbles:true}));
  if(!target.el.isConnected||target.el.value!==value)break;
  count++;
 }
 return {kind:'profile-filled' as const,count};
}
