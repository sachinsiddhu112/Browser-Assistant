import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Session,terminal} from '../../core/session';
import {startLocalDictation,suggestOnDevice} from '../../core/on-device';
import {routeIntent} from '../../core/intent';
import {GuidedSnapshot} from '../../core/guided-contract';
import {runGuided} from '../../core/guided-planner';
import {checkGuidedModel,createGuidedModel,GUIDE_TIMEOUT,type LocalModelAvailability} from '../../core/guided-model';
import {askCloud,cloudEndpoint,cloudPayload} from '../../core/cloud-client';
import './style.css';
function App(){
 const [session,setSession]=useState<Session|null>(null),[command,setCommand]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const [preparing,setPreparing]=useState(false),[listening,setListening]=useState(false),[draftNotice,setDraftNotice]=useState('');
 const [origin,setOrigin]=useState(''),[cloudToken,setCloudToken]=useState(''),[cloudReview,setCloudReview]=useState<{id:number;url:string}|null>(null);
 const [localStatus,setLocalStatus]=useState<LocalModelAvailability|'checking'>('checking');
 const [guiding,setGuiding]=useState(false);
 const guidedAbort=useRef<AbortController|null>(null);
 const modelAbort=useRef<AbortController|null>(null),stopSpeech=useRef<(()=>void)|null>(null);
 useEffect(()=>{
  let mounted=true;
  void checkGuidedModel().then(state=>{if(mounted)setLocalStatus(current=>current==='checking'?state:current)});
  return()=>{mounted=false;modelAbort.current?.abort();guidedAbort.current?.abort();stopSpeech.current?.()};
 },[]);
 async function prepare(){
  if(preparing||listening||!command.trim())return;
  setCloudReview(null);setPreparing(true);setError('');setDraftNotice('');
  const controller=new AbortController();modelAbort.current=controller;
  const timer=setTimeout(()=>controller.abort(),10000);
  try{
   const suggestion=await suggestOnDevice(command,controller.signal);
   controller.signal.throwIfAborted();
   setCommand(suggestion);setDraftNotice('Suggested on this device. Review the draft and click Run task.');
  }catch(e){setError(controller.signal.aborted?'On-device suggestion timed out.':e instanceof Error?e.message:'Could not suggest a command.')}
  finally{clearTimeout(timer);modelAbort.current=null;setPreparing(false)}
 }
 async function dictate(){
  if(listening){stopSpeech.current?.();return}
  setCloudReview(null);setListening(true);setError('');setDraftNotice('');
  try{stopSpeech.current=await startLocalDictation(
   text=>{setCommand(text);setDraftNotice('Dictated on this device. Review the draft before running it.')},
   reason=>{stopSpeech.current=null;setListening(false);if(reason)setError(reason)},
  )}catch(e){setListening(false);setError(e instanceof Error?e.message:'Could not start dictation.')}
 }
 async function send(type:string,extra:object={}){
  setPending(true);setError('');
  try{const r=await browser.runtime.sendMessage({type,...extra});if(!r?.ok)throw new Error(r?.error??'No response');setSession(r.session??null)}catch(e){setError(e instanceof Error?e.message:'Request failed')}finally{setPending(false)}
 }
 async function run(){
  const goal=command.trim();
  if(!goal||guidedAbort.current||pending||preparing||listening||session&&!terminal(session))return;
  if(routeIntent(goal)){setCloudReview(null);await send('START',{command:goal});return}
  const approved=cloudReview;
  setCloudReview(null);
  const controller=new AbortController();
  guidedAbort.current=controller;setGuiding(true);setError('');setDraftNotice('');
  const timer=setTimeout(()=>controller.abort('timeout'),GUIDE_TIMEOUT);
  let model:Awaited<ReturnType<typeof createGuidedModel>>|undefined;
  const message=async(type:string,extra:object={})=>{
   const r=await browser.runtime.sendMessage({type,...extra});
   if(!r?.ok)throw new Error(r?.error??'Browser task did not respond');
   return r;
  };
  try{
   let cloudUrl:string|undefined;
   if(approved){
    if(!/^[-_\w]{32,128}$/.test(cloudToken))throw new Error('Enter a valid private planner access token and run the task again.');
    const target=cloudEndpoint(origin);
    if(!await browser.permissions.request({origins:[target.host]}))throw new Error('Chrome did not grant access to the planner host.');
    controller.signal.throwIfAborted();
    cloudUrl=target.endpoint;
   }else{
    const state=await checkGuidedModel();
    controller.signal.throwIfAborted();
    setLocalStatus(state);
    if(state==='available'){
     try{model=await createGuidedModel(controller.signal)}
     catch{controller.signal.throwIfAborted();setLocalStatus('unavailable')}
    }
    if(!model){
     const [tab]=await browser.tabs.query({active:true,currentWindow:true});
     controller.signal.throwIfAborted();
     if(tab?.id===undefined||!tab.url?.startsWith('https:'))throw new Error('Select a regular HTTPS page and activate the extension before running a guided task.');
     setCloudReview({id:tab.id,url:tab.url});
     return;
    }
   }
   const ready=model;
   await runGuided({
    begin:async()=>{
     const r=await (approved?message('START_CLOUD',{mode:'cloud',expectedTab:approved}):message('START_GUIDED'));
     return {sessionId:Session.parse(r.session).id,snapshot:GuidedSnapshot.parse(r.snapshot)};
    },
    step:async(sessionId,decision)=>{
     const r=await message('STEP_GUIDED',{sessionId,decision});
     return r.snapshot===undefined?undefined:GuidedSnapshot.parse(r.snapshot);
    },
    fail:async sessionId=>{await message('FAIL_GUIDED',{sessionId})},
   }, input=>cloudUrl
     ?askCloud(cloudUrl,cloudToken,cloudPayload(goal,input.snapshot,input.previous),input.signal)
     :ready!.propose(goal,input),controller.signal);
  }catch(e){
   if(controller.signal.reason==='timeout')setError('The guided task timed out. Try a narrower request.');
   else if(!controller.signal.aborted)setError(e instanceof Error?e.message:'The guided task stopped.');
  }finally{
   clearTimeout(timer);model?.close();guidedAbort.current=null;setGuiding(false);
  }
 }
 function stop(){
  if(cloudReview){setCloudReview(null);return}
  guidedAbort.current?.abort('stopped');
  void send('STOP');
 }
 useEffect(()=>{
  const invalidateReview=()=>setCloudReview(null);
  const onTabUpdated=(_tabId:number,change:{status?:string;url?:string})=>{
   if(change.url||change.status==='loading')setCloudReview(review=>review?.id===_tabId?null:review);
  };
  browser.tabs.onActivated.addListener(invalidateReview);
  browser.tabs.onUpdated.addListener(onTabUpdated);
  const listener=(changes:Record<string,{newValue?:unknown}>,area:string)=>{if(area==='session'&&changes['assistant.session']){const p=Session.safeParse(changes['assistant.session'].newValue);setSession(p.success?p.data:null)}};
  browser.storage.onChanged.addListener(listener);void send('GET_STATE');return()=>{
   browser.storage.onChanged.removeListener(listener);
   browser.tabs.onActivated.removeListener(invalidateReview);
   browser.tabs.onUpdated.removeListener(onTabUpdated);
  };
 },[]);
 const running=!!session&&!terminal(session);
 const busy=pending||running||guiding||preparing||listening;
 return <main><h1>Browser Assistant</h1><p>Browser skills with local AI and optional cloud fallback</p>
 <p aria-label="Chrome AI availability">Chrome AI: {localStatus==='available'?'ready':localStatus==='checking'?'checking…':localStatus==='downloadable'||localStatus==='downloading'?'model not ready yet':'not available'}</p>
 <button disabled={pending} onClick={()=>void send('SHOW_OVERLAY')}>Show assistant on page</button>
 <form noValidate onSubmit={e=>{e.preventDefault();if(!cloudReview)void run()}}>
  <label htmlFor="command">Command</label><textarea id="command" maxLength={1000} value={command} disabled={preparing||listening||guiding} onChange={e=>{setCommand(e.target.value);setDraftNotice('');setCloudReview(null)}}/>
  <details open={cloudReview?true:undefined}><summary>Cloud planner settings</summary>
   <label htmlFor="planner-origin">Planner origin</label><input id="planner-origin" value={origin} type="url" onChange={e=>setOrigin(e.target.value)} disabled={guiding}/>
   <label htmlFor="planner-token">Private planner access token</label><input id="planner-token" value={cloudToken} type="password" autoComplete="off" onChange={e=>setCloudToken(e.target.value)} disabled={guiding}/>
  </details>
  {cloudReview&&<section aria-label="Cloud sharing review">
   <p>Chrome AI isn’t ready for this task. You can use the cloud planner instead.</p>
   <p>Continuing sends your command and limited visible excerpts from <strong>{new URL(cloudReview.url).origin}</strong> to <strong>{origin.trim()||"the configured planner"}</strong> and its model provider for this task only. Common sensitive patterns are masked, but redaction is not guaranteed. Continue only on a public page with a non-confidential command. Input-control labels and values aren’t sent.</p>
   {(!origin.trim()||!/^[-_\w]{32,128}$/.test(cloudToken))&&<p>Set the planner origin and a valid private access token above to continue.</p>}
   <button type="button" onClick={()=>setCloudReview(null)}>Cancel sharing</button>
  </section>}
  <button type={cloudReview?'button':'submit'} onClick={cloudReview?()=>void run():undefined} disabled={busy||!command.trim()||!!cloudReview&&(!origin.trim()||!/^[-_\w]{32,128}$/.test(cloudToken))}>{cloudReview?'Approve and continue':'Run task'}</button>
 </form>
 <button type="button" disabled={busy||!command.trim()} onClick={()=>void prepare()}>{preparing?'Preparing…':'Suggest supported command on device'}</button>
 <button type="button" disabled={pending||running||guiding||preparing} onClick={()=>void dictate()}>{listening?'Stop listening':'Dictate locally (English)'}</button>{draftNotice&&<p>{draftNotice}</p>}
 <button disabled={!running&&!guiding} onClick={stop}>Stop task</button>{session?.phase==='waiting-confirmation'&&session.videoApproval&&<section aria-label="YouTube choices"><p>Choose a result from YouTube:</p><ul>{session.videoApproval.choices.map(choice=><li key={choice.id}><button type="button" disabled={pending} onClick={()=>void send('PLAY_VIDEO',{sessionId:session.id,videoId:choice.id})}>{choice.title}</button></li>)}</ul></section>}{session?.draft&&<section aria-label="Form draft"><dl>{session.draft.map((field,i)=><React.Fragment key={i}><dt>{field.label}</dt><dd>{field.value}</dd></React.Fragment>)}</dl><p>The site can react to entered text immediately. Review every value. Upload files and submit on the website yourself.</p>
  <button disabled={pending||guiding} onClick={()=>void send('APPROVE_GUIDED',{sessionId:session.id})}>Fill these fields</button></section>}
 {session?.review?.type==='link'&&<section aria-label="Link review"><p>{session.review.target.label}</p><p>{session.review.target.url}</p>
  <button disabled={pending||guiding} onClick={()=>void send('APPROVE_GUIDED',{sessionId:session.id})}>Open this link</button></section>}
 <p role="status">{session?.phase??'idle'}: {session?.message??'Ready'}</p>{error&&<p role="alert">{error}</p>}<small>Try Open YouTube, Search Google for NestJS, Play Kesariya on YouTube, Scroll down, Go back, Next tab, Inspect page, Page down, or Type NestJS into search. For other requests, Run tries Chrome AI first and offers cloud planning only if Chrome AI isn’t ready. Nothing is shared with the planner until you approve. Local mode can fill reviewed text fields; neither mode uploads files or submits forms.</small></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
