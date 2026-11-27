import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Session,terminal} from '../../core/session';
import {startLocalDictation,suggestOnDevice} from '../../core/on-device';
import {parseFormIntent} from '../../core/form-intent';
import {parseSiteIntent} from '../../core/site-intent';
import {routeIntent} from '../../core/intent';
import {GuidedSnapshot} from '../../core/guided-contract';
import {runGuided} from '../../core/guided-planner';
import {checkGuidedModel,createGuidedModel,GUIDE_TIMEOUT,type LocalModelAvailability} from '../../core/guided-model';
import {askCloud,cloudPayload} from '../../core/cloud-client';
import './style.css';
const PRIVACY_NOTICE_KEY='assistant.privacyNoticeHidden';
const QUICK_COMMANDS=['Scroll down','Inspect page','YouTube in new tab'];
function Icon({name}:{name:'brand'|'mic'|'arrow'|'shield'|'settings'|'stop'}){
 const paths={
  brand:<><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M11 9v11m4-6 2 2-2 2"/></>,
  mic:<><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11v1a7 7 0 0 0 14 0v-1m-7 8v3"/></>,
  arrow:<path d="M4 12h15m-6-6 6 6-6 6"/>,
  shield:<path d="M12 22s7-3 7-10V5l-7-3-7 3v7c0 7 7 10 7 10zm-3-10 2 2 4-4"/>,
  settings:<><path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="2" fill="currentColor"/><circle cx="16" cy="17" r="2" fill="currentColor"/></>,
  stop:<rect x="6" y="6" width="12" height="12" rx="2"/>,
 };
 return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
function App(){
 const [session,setSession]=useState<Session|null>(null),[command,setCommand]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const [preparing,setPreparing]=useState(false),[listening,setListening]=useState(false),[draftNotice,setDraftNotice]=useState('');
 const [siteReview,setSiteReview]=useState<ReturnType<typeof parseSiteIntent>>(null);
 const initialAvailability=useRef<Promise<LocalModelAvailability>|null>(null);
 const [guiding,setGuiding]=useState(false);
 const [noticeHidden,setNoticeHidden]=useState(false);
 const guidedAbort=useRef<AbortController|null>(null);
 const modelAbort=useRef<AbortController|null>(null),stopSpeech=useRef<(()=>void)|null>(null);
 useEffect(()=>{
  let mounted=true;
  initialAvailability.current=checkGuidedModel();
  void browser.storage.local.get(PRIVACY_NOTICE_KEY).then(values=>{
   if(mounted&&values[PRIVACY_NOTICE_KEY]===true)setNoticeHidden(true);
  }).catch(()=>{});
  return()=>{mounted=false;modelAbort.current?.abort();guidedAbort.current?.abort();stopSpeech.current?.()};
 },[]);
 function changeNotice(hidden:boolean){
  setNoticeHidden(hidden);
  void browser.storage.local.set({[PRIVACY_NOTICE_KEY]:hidden}).catch(()=>{});
 }
 async function prepare(){
  if(preparing||listening||!command.trim())return;
  setSiteReview(null);setPreparing(true);setError('');setDraftNotice('');
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
  setSiteReview(null);setListening(true);setError('');setDraftNotice('');
  try{stopSpeech.current=await startLocalDictation(
   text=>{setCommand(text);setDraftNotice('Dictated on this device. Review the draft before running it.')},
   reason=>{stopSpeech.current=null;setListening(false);if(reason)setError(reason)},
  )}catch(e){setListening(false);setError(e instanceof Error?e.message:'Could not start dictation.')}
 }
 async function send(type:string,extra:object={}){
  setPending(true);setError('');
  try{const r=await browser.runtime.sendMessage({type,...extra});if(!r?.ok)throw new Error(r?.error??'No response');setSession(r.session??null)}catch(e){setError(e instanceof Error?e.message:'Request failed')}finally{setPending(false)}
 }
 async function run(approveSite=false){
  const goal=command.trim();
  if(!goal||guidedAbort.current||pending||preparing||listening||session&&!terminal(session))return;
  if(routeIntent(goal)||parseFormIntent(goal)){await send('START',{command:goal});return}
  const site=parseSiteIntent(goal);
  if(site&&!approveSite){setSiteReview(site);return}
  setSiteReview(null);
  let plannerGoal=goal;
  let expectedSiteTab:number|undefined;

  const controller=new AbortController();
  guidedAbort.current=controller;setGuiding(true);setError('');setDraftNotice('');
  const timer=setTimeout(()=>controller.abort('timeout'),GUIDE_TIMEOUT);
  let model:Awaited<ReturnType<typeof createGuidedModel>>|undefined;
  const message=async(type:string,extra:object={})=>{
   const r=await browser.runtime.sendMessage({type,...extra});
   if(!r?.ok)throw new Error(r?.error??'Browser task did not respond');
   return r;
  };
  async function awaitPhase(id:string,expected:'success'|'thinking'){
   while(true){
    controller.signal.throwIfAborted();
    const r=await message('GET_STATE');
    const s=Session.parse(r.session);
    if(s.id!==id)throw new Error('The browser task changed');
    if(s.phase===expected)return s;
    if(terminal(s))throw new Error(s.message);
    await new Promise(resolve=>setTimeout(resolve,180));
   }
  }
  try{
   if(site){
    const origin=site.origin+'/*';
    if(!await browser.permissions.request({origins:[origin]}))throw new Error('Chrome did not grant access to '+site.origin);
    controller.signal.throwIfAborted();
    const opened=Session.parse((await message('START',{command:goal})).session);
    const destination=await awaitPhase(opened.id,'success');
    if(!site.goal)return;
    const tab=await browser.tabs.get(destination.tabId);
    if(!tab.active||tab.url!==site.url)throw new Error('The requested page changed while opening it');
    plannerGoal=site.goal;expectedSiteTab=destination.tabId;
   }
   const [selected]=await browser.tabs.query({active:true,currentWindow:true});
   controller.signal.throwIfAborted();
   if(selected?.id===undefined||!selected.url?.startsWith('https:'))throw new Error('Select an HTTPS page and open the extension from its toolbar icon.');
   if(expectedSiteTab!==undefined&&(selected.id!==expectedSiteTab||selected.url!==site?.url))throw new Error('The opened page changed');
   const expectedTab={id:selected.id,url:selected.url};
   // Start the readiness probe on panel load; refresh non-ready results because
   // Chrome can finish a download while the panel is open.
   const initial=await (initialAvailability.current??checkGuidedModel());
   controller.signal.throwIfAborted();
   const state=initial==='available'?initial:await checkGuidedModel();
   controller.signal.throwIfAborted();
   if(state==='available'){
    try{model=await createGuidedModel(controller.signal)}
    catch{controller.signal.throwIfAborted();initialAvailability.current=null}
   }
   const ready=model;
   await runGuided({
    begin:async()=>{
     const r=await (ready?message('START_GUIDED',{expectedTab}):message('START_CLOUD',{mode:'cloud',expectedTab}));
     return {sessionId:Session.parse(r.session).id,snapshot:GuidedSnapshot.parse(r.snapshot)};
    },
    step:async(sessionId,decision)=>{
     let r=await message('STEP_GUIDED',{sessionId,decision});
     if(decision.type==='open_link'||decision.type==='expand'){
      await awaitPhase(sessionId,'thinking');
      r=await message('RESUME_GUIDED',{sessionId});
     }
     return r.snapshot===undefined?undefined:GuidedSnapshot.parse(r.snapshot);
    },
    fail:async sessionId=>{await message('FAIL_GUIDED',{sessionId})},
   }, input=>ready?ready.propose(plannerGoal,input)
     :askCloud(cloudPayload(plannerGoal,input.snapshot,input.previous),input.signal),controller.signal);
  }catch(e){
   if(controller.signal.reason==='timeout')setError('The guided task timed out. Try a narrower request.');
   else if(!controller.signal.aborted)setError(e instanceof Error?e.message:'The guided task stopped.');
  }finally{
   clearTimeout(timer);model?.close();guidedAbort.current=null;setGuiding(false);
  }
 }
 function stop(){
  if(siteReview){setSiteReview(null);return}
  guidedAbort.current?.abort('stopped');
  void send('STOP');
 }
 useEffect(()=>{
  const listener=(changes:Record<string,{newValue?:unknown}>,area:string)=>{if(area==='session'&&changes['assistant.session']){const p=Session.safeParse(changes['assistant.session'].newValue);setSession(p.success?p.data:null)}};
  browser.storage.onChanged.addListener(listener);void send('GET_STATE');return()=>{
   browser.storage.onChanged.removeListener(listener);
  };
 },[]);
 const running=!!session&&!terminal(session);
 const busy=pending||running||guiding||preparing||listening;
 const changeCommand=(value:string)=>{setCommand(value);setSiteReview(null);setDraftNotice('');setError('')};
 const phase=guiding&&!running?'thinking':session?.phase??'idle';
 const result=guiding&&!running?'Preparing the task…':session?.message??'Your result will appear here.';
 return <main className="panel">
  <header className="hero">
   <div className="brand-row"><span className="mark"><Icon name="brand"/></span><span className="eyebrow">CHROME EXTENSION</span></div>
   <h1>Browser Assistant</h1>
   <p>Read pages and navigate with your approval.</p>
  </header>

  {!noticeHidden&&<aside className="card privacy-note" aria-label="Privacy note">
   <Icon name="shield"/>
   <p>Some tasks may send your command and visible page excerpts to our online service. Use public pages and non-confidential commands.</p>
   <button className="quiet" type="button" onClick={()=>changeNotice(true)} aria-label="Hide privacy note">Hide</button>
  </aside>}

  <form className="composer card" noValidate onSubmit={e=>{e.preventDefault();if(!siteReview)void run()}}>
   <label htmlFor="command">Command</label>
   <textarea id="command" maxLength={1000} placeholder="What would you like to do on this page?" value={command} disabled={preparing||listening||guiding||running} onChange={e=>changeCommand(e.target.value)}/>
   <div className="examples" aria-label="Example commands">
    {QUICK_COMMANDS.map(label=><button className="chip" key={label} type="button" disabled={busy} onClick={()=>changeCommand(label==='YouTube in new tab'?'Open YouTube in a new tab':label)}>{label}</button>)}
   </div>
   <div className="composer-actions">
    {!siteReview&&<button className="primary" type="submit" disabled={busy||!command.trim()}>Run task <Icon name="arrow"/></button>}
    <button className="secondary mic" type="button" disabled={pending||running||guiding||preparing} onClick={()=>void dictate()} title={listening?'Stop listening':'Dictate locally (English)'} aria-label={listening?'Stop listening':'Dictate locally (English)'}><Icon name="mic"/>{listening?'Stop listening':'Dictate'}</button>
   </div>
   {draftNotice&&<p className="muted helper">{draftNotice}</p>}
  </form>

  {siteReview&&<section className="card review" aria-label="Website access review">
   <h2>Open this site in a new tab?</h2><p className="target">{siteReview.url}</p>
   <p className="muted">Chrome may ask for access to this site only. You can revoke it in the extension’s settings.</p>
   <button className="primary full" type="button" disabled={busy} onClick={()=>void run(true)}>Open and continue <Icon name="arrow"/></button>
   <button className="quiet full" type="button" onClick={()=>setSiteReview(null)}>Cancel</button>
  </section>}
  <section className="card result" aria-labelledby="result-title">
   <div className="result-head"><h2 id="result-title">Task result</h2>
    {(running||guiding)&&<button className="quiet stop" type="button" onClick={stop}><Icon name="stop"/>Stop task</button>}
   </div>
   <div className="result-status" role="status"><span className="phase" data-phase={phase}>{phase}</span><p>{result}</p></div>
   {error&&<p className="error" role="alert">{error}</p>}
  </section>

  {session?.phase==='waiting-confirmation'&&session.videoApproval&&<section className="card review" aria-label="YouTube choices">
   <h2>Choose a YouTube result</h2>
   <ul className="choice-list">{session.videoApproval.choices.map(choice=><li key={choice.id}><button className="secondary full" type="button" disabled={pending} onClick={()=>void send('PLAY_VIDEO',{sessionId:session.id,videoId:choice.id})}>{choice.title}</button></li>)}</ul>
  </section>}
  {session?.draft&&<section className="card review" aria-label="Form draft">
   <h2>Review form draft</h2>{session.guided&&<p className="target">{new URL(session.guided.url).origin}</p>}
   <dl>{session.draft.map((field,i)=><React.Fragment key={i}><dt>{field.label}</dt><dd>{field.value}</dd></React.Fragment>)}</dl>
   <p className="muted">The site can react to entered text immediately. Review every value. Upload files and submit on the website yourself.</p>
   <button className="primary full" type="button" disabled={pending||guiding} onClick={()=>void send('APPROVE_GUIDED',{sessionId:session.id})}>Fill these fields</button>
  </section>}
  {session?.review?.type==='expand'&&<section className="card review" aria-label="Disclosure review">
   <h2>Expand this section?</h2><p>{session.review.target.label}</p>
   <button className="primary full" type="button" disabled={pending} onClick={()=>void send('APPROVE_GUIDED',{sessionId:session.id})}>Expand and continue</button>
  </section>}
  {session?.review?.type==='link'&&<section className="card review" aria-label="Link review">
   <h2>Review link</h2><p>{session.review.target.label}</p><p className="target">{session.review.target.url}</p>
   <button className="primary full" type="button" disabled={pending} onClick={()=>void send('APPROVE_GUIDED',{sessionId:session.id})}>Open this link <Icon name="arrow"/></button>
  </section>}

  <details className="card settings">
   <summary><Icon name="brand"/><span>More tools</span></summary>
   <div className="settings-body tool-stack">
    {noticeHidden&&<button className="secondary" type="button" onClick={()=>changeNotice(false)}>Show privacy note</button>}
    <button className="secondary" type="button" disabled={pending} onClick={()=>void send('SHOW_OVERLAY')}>Show assistant on page</button>
    <button className="secondary" type="button" disabled={busy||!command.trim()} onClick={()=>void prepare()}>{preparing?'Preparing…':'Suggest a supported command'}</button>
   </div>
  </details>
  <footer><Icon name="shield"/><span>You review links and form changes before they happen.</span></footer>
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
