import React,{useEffect,useRef,useState} from 'react';
import {applicationIntent,inspectJobPage,jobMatches} from '../../core/application-intent';
import {emptyProfile,Profile,type Profile as ContactProfile} from '../../core/profile';
import {discoverResearchSources,validateResearchSources,type ResearchSource} from '../../core/research';
import {Session} from '../../core/session';
import {openVerified} from './research-ui';

type Intent=NonNullable<ReturnType<typeof applicationIntent>>;
type Review={intent:Intent;windowId:number;choices:ResearchSource[];stage:'posting'|'form'};
export async function panelRequest(type:string,extra:object={}){
 const result=await browser.runtime.sendMessage({type,...extra});
 if(!result?.ok)throw new Error(result?.error??'The task could not be completed.');
 return result;
}
export function useApplication(onDraft:(s:Session)=>void){
 const [review,setReview]=useState<Review|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const ctl=useRef<AbortController|null>(null);
 useEffect(()=>()=>ctl.current?.abort(),[]);
 function clear(){setReview(null);setMessage('');setError('')}
 function stop(){ctl.current?.abort();clear()}
 async function start(intent:Intent){
  if(ctl.current)return;clear();
  const controller=new AbortController();ctl.current=controller;setBusy(true);
  try{
   const [anchor]=await browser.tabs.query({active:true,currentWindow:true});
   if(!anchor||anchor.incognito)throw new Error('Open a regular Chrome window to find an application.');
   setMessage('Finding matching job postings…');
   const url='https://www.google.com/search?q='+encodeURIComponent(intent.query);
   const id=await openVerified(url,anchor.windowId,true,controller.signal);
   const [r]=await browser.scripting.executeScript({target:{tabId:id},func:discoverResearchSources});
   const latest=await browser.tabs.get(id);
   controller.signal.throwIfAborted();
   if(!r?.documentId||!latest.active||latest.url!==url)throw new Error('The search tab changed.');
   const choices=validateResearchSources(r.result);
   if(!choices.length)throw new Error('No supported result was found. Open a verified application form and use Fill from my profile.');
   setReview({intent,choices,windowId:anchor.windowId,stage:'posting'});setMessage('');
  }catch(e){if(!controller.signal.aborted){setMessage('');setError(e instanceof Error?e.message:'Could not locate a job posting.')}}
  finally{ctl.current=null;setBusy(false)}
 }
 async function pick(selected:ResearchSource){
  if(!review||ctl.current||!review.choices.some(x=>x.url===selected.url))return;
  const controller=new AbortController();ctl.current=controller;setBusy(true);setError('');
  try{
   if(!await browser.permissions.request({origins:[new URL(selected.url).origin+'/*']}))throw new Error('Access to this site was not granted.');
   controller.signal.throwIfAborted();setMessage('Checking the selected page…');
   const id=await openVerified(selected.url,review.windowId,true,controller.signal);
   const [r]=await browser.scripting.executeScript({target:{tabId:id},func:inspectJobPage});
   const latest=await browser.tabs.get(id);
   controller.signal.throwIfAborted();
   const page=r?.result;
   if(!r?.documentId||!page||page.url!==selected.url||latest.url!==selected.url||!latest.active)throw new Error('The selected page changed.');
   if(review.stage==='posting'&&!jobMatches(review.intent.role,review.intent.organization,page,review.intent.location))throw new Error('Could not verify the requested title, employer, or location on this page. Pick another posting, or review the page yourself.');
   if(review.stage==='posting'&&!page.inlineForm){
    const choices=validateResearchSources(page.links).filter(x=>x.url!==selected.url);
    if(!choices.length)throw new Error('I found the job but not a supported application link. The posting is open for you to continue.');
    setReview({...review,choices,stage:'form'});setMessage('');return;
   }
   if(!page.inlineForm)throw new Error('There is no supported form on this page. If the site needs a manual step, finish it and use Fill from my profile.');
   setReview(null);setMessage('');
   const response=await panelRequest('DRAFT_PROFILE',{expectedTab:{id,url:selected.url}});
   if(controller.signal.aborted){await panelRequest('STOP').catch(()=>{});return}
   onDraft(Session.parse(response.session));
  }catch(e){if(!controller.signal.aborted){setMessage('');setError(e instanceof Error?e.message:'Could not prepare the application.')}}
  finally{ctl.current=null;setBusy(false)}
 }
 return {review,busy,message,error,start,pick,clear,stop};
}

export function ApplicationCards({flow}:{flow:ReturnType<typeof useApplication>}){
 if(!flow.review&&!flow.busy&&!flow.error)return null;
 return <section className="card review" aria-label="Job application">
  <h2>{flow.review?.stage==='form'?'Choose the application form':'Find the application'}</h2>
  {flow.review&&<>
   <p>{flow.review.intent.role} at {flow.review.intent.organization}{flow.review.intent.location?' · '+flow.review.intent.location:''}</p>
   <p className="muted">Check the destination before opening. Nothing will be filled or submitted yet.</p>
   <ul className="choice-list">{flow.review.choices.map(item=><li key={item.url}>
    <button className="secondary full application-destination" type="button" disabled={flow.busy} onClick={()=>void flow.pick(item)}>{item.title}<small>{item.url}</small></button>
   </li>)}</ul>
  </>}
  {flow.message&&<p>{flow.message}</p>}
  {flow.error&&<p role="alert" className="error">{flow.error}</p>}
  {(flow.busy||flow.review)&&<button className="quiet" type="button" onClick={flow.stop}>Cancel application task</button>}
 </section>;
}

export function SavedDetails({onFill,disabled}:{onFill:()=>void;disabled:boolean}){
 const [value,setValue]=useState<ContactProfile>(emptyProfile),[status,setStatus]=useState(''),[working,setWorking]=useState(false);
 const loaded=useRef(false);
 const fields=[['firstName','First name'],['lastName','Last name'],['email','Email address'],['phone','Phone number']] as const;
 async function load(){
  if(loaded.current)return;loaded.current=true;setWorking(true);
  try{setValue(Profile.parse((await panelRequest('GET_PROFILE')).profile));setStatus('')}
  catch(e){loaded.current=false;setStatus(e instanceof Error?e.message:'Could not load saved details.')}
  finally{setWorking(false)}
 }
 async function save(remove=false){
  const parsed=Profile.safeParse(value);
  if(!remove&&!parsed.success){setStatus('Check that the email and phone number are valid.');return}
  setWorking(true);
  try{
   const r=await panelRequest(remove?'DELETE_PROFILE':'SAVE_PROFILE',remove?{}:{profile:parsed.data});
   setValue(Profile.parse(r.profile));setStatus(remove?'Saved details deleted.':'Saved on this device.');
  }catch(e){setStatus(e instanceof Error?e.message:'Could not update saved details.')}
  finally{setWorking(false)}
 }
 return <details className="card settings" onToggle={e=>{if(e.currentTarget.open)void load()}} aria-label="Saved details">
  <summary>Saved details</summary>
  <div className="settings-body draft-fields">
   <p>Save contact details once. They stay on this device and are used only in a draft you review.</p>
   {fields.map(([key,label])=><label key={key}>{label}<input type={key==='email'?'email':key==='phone'?'tel':'text'} maxLength={key==='email'?120:key==='phone'?35:80} disabled={working} value={value[key]} onChange={e=>{const text=e.currentTarget.value;setValue(v=>({...v,[key]:text}));setStatus('')}}/></label>)}
   <button type="button" className="primary" disabled={working} onClick={()=>void save()}>Save details</button>
   <button type="button" className="secondary" disabled={disabled||working} onClick={onFill}>Fill from my profile</button>
   <button type="button" className="quiet" disabled={working} onClick={()=>void save(true)}>Delete saved details</button>
   {status&&<p className="muted" aria-live="polite">{status}</p>}
  </div>
 </details>;
}
