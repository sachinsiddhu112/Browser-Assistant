import {chatKey,chatSources,modelContext,pendingQuestion,taskKey,WorkingChat,type ChatNote} from '../../core/working-chat';
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Session,terminal} from '../../core/session';
import {startLocalDictation,suggestOnDevice} from '../../core/on-device';
import {parseFormIntent} from '../../core/form-intent';
import {parseSiteIntent} from '../../core/site-intent';
import {commandSites,intentInstructions,resolveIntent,resumesPending} from '../../core/command-intent';
import {normalizePlatform,routeIntent} from '../../core/intent';
import {GuidedSnapshot} from '../../core/guided-contract';
import {runGuided} from '../../core/guided-planner';
import {checkGuidedModel,createGuidedModel,createLocalTaskModel,GUIDE_TIMEOUT,type LocalModelAvailability} from '../../core/guided-model';
import {askCloud,askCloudIntent,cloudPayload} from '../../core/cloud-client';
import {createResultSpeech} from '../../core/result-speech';
import {parseResearch} from '../../core/research';
import {ResearchCards,useResearch} from './research-ui';
import {applicationIntent,isProfileCommand} from '../../core/application-intent';
import {ApplicationCards,SavedDetails,useApplication} from './application-ui';
import './style.css';
const SPEAK_KEY='assistant.speakResults';
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
 const research=useResearch();
 const [speakingEnabled,setSpeakingEnabled]=useState(false),[speechNotice,setSpeechNotice]=useState('');
 const [speaker]=useState(createResultSpeech);
 const [voicesRevision,setVoicesRevision]=useState(0);
 const lastSpoken=useRef(''),ignoredSession=useRef(''),speechArmed=useRef(false),speechPreferenceTouched=useRef(false);
 const [draftValues,setDraftValues]=useState<string[]>([]);
 const [draftSkipped,setDraftSkipped]=useState<number[]>([]);
 const [session,setSession]=useState<Session|null>(null),[command,setCommand]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const application=useApplication(setSession);
 const [preparing,setPreparing]=useState(false),[listening,setListening]=useState(false),[draftNotice,setDraftNotice]=useState('');
 const [siteReview,setSiteReview]=useState<ReturnType<typeof parseSiteIntent>>(null);
 const [intentQuestion,setIntentQuestion]=useState('');
 const [chat,setChat]=useState<WorkingChat|null>(null);
 const [resetting,setResetting]=useState(false);
 const windowRef=useRef<number|undefined>(undefined),chatTurn=useRef<string|undefined>(undefined);
 const startingChat=useRef(false);
 const workingContextRef=useRef<string|undefined>(undefined);
 async function rawMessage(type:string,extra:object={},track=true){
  const windowId=windowRef.current??(await browser.windows.getCurrent()).id;
  if(windowId===undefined)throw new Error('The Chrome window is unavailable.');
  windowRef.current=windowId;
  const taskTurnId=track?chatTurn.current:undefined;
  const r=await browser.runtime.sendMessage({type,windowId,...(taskTurnId?{taskTurnId}:{}),...extra});
  if(!r?.ok)throw new Error(r?.error??'Browser task did not respond');
  return r;
 }
 async function noteChat(note:ChatNote,resumes?:string){
  const turnId=chatTurn.current;
  if(!turnId)return;
  await rawMessage('CHAT_NOTE',{turnId,note,...(resumes?{resumes}:{})},false);
 }

 const initialAvailability=useRef<Promise<LocalModelAvailability>|null>(null);
 const [guiding,setGuiding]=useState(false);
 const [noticeHidden,setNoticeHidden]=useState(false);
 const guidedAbort=useRef<AbortController|null>(null);
 const modelAbort=useRef<AbortController|null>(null),stopSpeech=useRef<(()=>void)|null>(null);
 useEffect(()=>{
  initialAvailability.current=checkGuidedModel();
  return()=>{modelAbort.current?.abort();guidedAbort.current?.abort();stopSpeech.current?.();speaker.cancel()};
 },[speaker]);
 useEffect(()=>{
  let mounted=true;
  void browser.storage.local.get(SPEAK_KEY).then(values=>{
   if(mounted&&!speechPreferenceTouched.current)setSpeakingEnabled(values[SPEAK_KEY]===true);
  }).catch(()=>{});
  return()=>{mounted=false};
 },[]);
 const answer=research.result?{id:research.result.id,text:research.result.answer}:
  (session?.phase==='success'||session?.phase==='answered')?{id:session.id,text:session.message}:null;
 function playResult(value:{id:string;text:string}){
  const state=speaker.speak(value.text,{onError:code=>setSpeechNotice(code==='not-allowed'?'Playback needs a click. Use Play result.':'Could not play the installed voice.')});
  if(state==='queued'){lastSpoken.current=value.id;setSpeechNotice('')}
  if(state==='unavailable')setSpeechNotice('No on-device voice is available. You can still read the result.');
 }
 useEffect(()=>{
  if(!speakingEnabled||!speechArmed.current||listening||!answer||(lastSpoken.current===answer.id||ignoredSession.current===answer.id))return;
  playResult(answer);
 },[speakingEnabled,listening,answer?.id,answer?.text,speaker,voicesRevision]);
 useEffect(()=>{
  if(!speakingEnabled)return;
  const synth=globalThis.speechSynthesis;
  const refresh=()=>{
   if(speaker.hasLocalVoice()){
    setSpeechNotice(notice=>notice.startsWith('No on-device voice')?'':notice);
    setVoicesRevision(version=>version+1);
   }
  };
  synth?.addEventListener?.('voiceschanged',refresh);
  return()=>synth?.removeEventListener?.('voiceschanged',refresh);
 },[speaker,speakingEnabled]);
 function toggleSpeech(){
  const enabled=!speakingEnabled;
  speechPreferenceTouched.current=true;
  setSpeechNotice('');setSpeakingEnabled(enabled);
  void browser.storage.local.set({[SPEAK_KEY]:enabled}).catch(()=>{});
  if(!enabled){speaker.cancel();return}
  if(answer){speechArmed.current=true;lastSpoken.current='';ignoredSession.current=''}
  if(!speaker.hasLocalVoice())setSpeechNotice('No on-device voice is available. You can still read the result.');
 }
 useEffect(()=>{
  setDraftValues(session?.draft?.map(field=>field.value)??[]);setDraftSkipped([]);
 },[session?.id,session?.draft?.length]);
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
  speaker.cancel();setSiteReview(null);setListening(true);setError('');setDraftNotice('');
  try{stopSpeech.current=await startLocalDictation(
   text=>{setCommand(text);setDraftNotice('Dictated on this device. Review the draft before running it.')},
   reason=>{stopSpeech.current=null;setListening(false);if(reason)setError(reason)},
  )}catch(e){setListening(false);setError(e instanceof Error?e.message:'Could not start dictation.')}
 }
 async function send(type:string,extra:object={}){
  setPending(true);setError('');
  try{const r=await rawMessage(type,extra);setSession(r.session??null)}catch(e){setError(e instanceof Error?e.message:'Request failed')}finally{setPending(false)}
 }
 async function run(approvedSite?:NonNullable<ReturnType<typeof parseSiteIntent>>){
  const goal=command.trim();
  if(startingChat.current||resetting||!goal||guidedAbort.current||research.busy||research.review||application.busy||application.review||pending||preparing||listening||session&&!terminal(session))return;
  let past:WorkingChat|null=null;
  if(!approvedSite){
   startingChat.current=true;
   try{
    const current=await browser.windows.getCurrent();
    if(!current.incognito){
     const started=await rawMessage('CHAT_BEGIN',{input:goal},false);
     chatTurn.current=started.turn?.id;
     past=WorkingChat.parse(started.past);
     workingContextRef.current=past.turns.length?modelContext(past):undefined;
     setChat(WorkingChat.parse(started.chat));
    }else{chatTurn.current=undefined;workingContextRef.current=undefined}
   }catch(e){setError(e instanceof Error?e.message:'Could not start the temporary chat.');return}
   finally{startingChat.current=false}
  }
  setIntentQuestion('');setSession(null);
  speaker.cancel();speechArmed.current=true;lastSpoken.current=answer?.id??'';ignoredSession.current=session?.id??'';setSpeechNotice('');
  if(isProfileCommand(goal)){research.clear();application.clear();await send('DRAFT_PROFILE');return}
  const job=applicationIntent(goal);
  if(job){research.clear();setSiteReview(null);setError('');await application.start(job);return}
  application.clear();
  try{
   const plan=parseResearch(goal);
   if(plan){setSiteReview(null);setError('');await research.start(plan,workingContextRef.current);return}
  }catch(e){setError(e instanceof Error?e.message:'Could not start research.');return}
  research.clear();
  if(!approvedSite&&(routeIntent(goal)||parseFormIntent(goal))){await send('START',{command:goal});return}
  const site=approvedSite??parseSiteIntent(goal);
  if(site&&!approvedSite){setSiteReview(site);return}
  setSiteReview(null);
  let plannerGoal=goal;
  let expectedSiteTab:number|undefined;
  let resumePage:ChatNote['page'];

  const controller=new AbortController();
  guidedAbort.current=controller;setGuiding(true);setError('');setDraftNotice('');
  const timer=setTimeout(()=>controller.abort('timeout'),GUIDE_TIMEOUT);
  let model:Awaited<ReturnType<typeof createGuidedModel>>|undefined;
  const message=(type:string,extra:object={})=>rawMessage(type,extra);
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
    const opened=Session.parse((await message('START',{command:'Open '+site.url})).session);
    const destination=await awaitPhase(opened.id,'success');
    if(!site.goal)return;
    const tab=await browser.tabs.get(destination.tabId);
    if(!tab.active||tab.url!==site.url)throw new Error('The requested page changed while opening it');
    plannerGoal=site.goal;expectedSiteTab=destination.tabId;
   }
   const [selected]=await browser.tabs.query({active:true,windowId:windowRef.current});
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
   if(!site){
    const candidates=commandSites(goal);
    const waiting=past?pendingQuestion(past):undefined;
    const sources=past?chatSources(past):[];
    const contextSites=sources.flatMap(source=>{
     const site=parseSiteIntent('Open '+source.url);
     return site?[site]:[];
    });
    const workingChat=workingContextRef.current;
    const resolve=(proposal:unknown)=>{
     const resume=resumesPending(proposal);
     if(resume&&!waiting)throw new Error('There is no pending clarification to resume.');
     return {resume,intent:resolveIntent(proposal,resume?waiting!.request+' '+goal:goal,candidates,contextSites)};
    };
    const intentGoal=normalizePlatform(goal);
    let raw:unknown;
    if(state==='available'){
     let classifier:Awaited<ReturnType<typeof createLocalTaskModel>>|undefined;
     try{
      classifier=await createLocalTaskModel(intentInstructions,controller.signal);
      const answer=await classifier.prompt(JSON.stringify({goal:intentGoal,sites:candidates.map(s=>new URL(s.origin).hostname),...(workingChat?{workingChat:JSON.parse(workingChat)}:{})}),{signal:controller.signal});
      if(answer.length>1000)throw new Error('Response too long');
      raw=JSON.parse(answer);
      resolve(raw);
     }catch{raw=undefined;controller.signal.throwIfAborted()}
     finally{classifier?.destroy()}
    }
    if(raw===undefined){
     const current=await browser.tabs.get(expectedTab.id);
     if(!current.active||current.url!==expectedTab.url)throw new Error('The active page changed. Run the command again.');
     if(!current.incognito)raw=await askCloudIntent(intentGoal,candidates,controller.signal,fetch,workingChat);
    }
    controller.signal.throwIfAborted();
    if(raw!==undefined){
     const {intent,resume}=resolve(raw);
     if(resume&&waiting){
      await noteChat({kind:'status',result:'Continuing the pending request with this answer.'},waiting.id);
      controller.signal.throwIfAborted();
     }
     const current=await browser.tabs.get(expectedTab.id);
     if(!current.active||current.url!==expectedTab.url)throw new Error('The active page changed. Run the command again.');
     if(intent.type==='skill'){await send('START',{command:intent.command,expectedTab});return}
     if(intent.type==='profile'){await send('DRAFT_PROFILE',{expectedTab});return}
     if(intent.type==='job'){await application.start(intent.job);return}
     if(intent.type==='research'){await research.start(intent.plan,workingContextRef.current);return}
     if(intent.type==='site'){setSiteReview(intent.site);return}
     if(intent.type==='clarify'){await noteChat({kind:'question',result:intent.message},resume?waiting?.id:undefined);setIntentQuestion(intent.message);return}
     if(resume&&waiting){
      workingContextRef.current=modelContext(past!,goal);
      resumePage=waiting.page;
      plannerGoal=waiting.request;
     }
    }
   }
   if(state==='available'){
    try{model=await createGuidedModel(controller.signal)}
    catch{controller.signal.throwIfAborted();initialAvailability.current=null}
   }
   const ready=model;
   await runGuided({
    begin:async()=>{
     const r=await (ready?message('START_GUIDED',{expectedTab,...(resumePage?{resumePage}:{})}):message('START_CLOUD',{mode:'cloud',expectedTab,...(resumePage?{resumePage}:{})}));
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
   }, input=>ready?ready.propose(plannerGoal,{...input,workingChat:workingContextRef.current})
     :askCloud(cloudPayload(plannerGoal,input.snapshot,input.previous,workingContextRef.current),input.signal),controller.signal);
  }catch(e){
   if(controller.signal.reason==='timeout')setError('The guided task timed out. Try a narrower request.');
   else if(!controller.signal.aborted)setError(e instanceof Error?e.message:'The guided task stopped.');
  }finally{
   clearTimeout(timer);model?.close();guidedAbort.current=null;setGuiding(false);
  }
 }
 function stop(){
  if(siteReview){setSiteReview(null);return}
  speaker.cancel();guidedAbort.current?.abort('stopped');
  if(research.busy)research.stop();
  if(application.busy)application.stop();
  void send('STOP');
 }
 async function resetChat(){
  if(resetting||startingChat.current)return;
  setResetting(true);
  guidedAbort.current?.abort('new chat');research.stop();application.stop();speaker.cancel();
  modelAbort.current?.abort();stopSpeech.current?.();chatTurn.current=undefined;workingContextRef.current=undefined;
  try{
   const r=await rawMessage('CHAT_RESET',{},false);
   setChat(WorkingChat.parse(r.chat));setSession(null);research.clear();application.clear();
   setCommand('');setIntentQuestion('');setSiteReview(null);setError('');setDraftNotice('');
  }catch(e){setError(e instanceof Error?e.message:'Could not clear the current chat.')}
  finally{setResetting(false)}
 }
 useEffect(()=>{
  let mounted=true;
  const listener=(changes:Record<string,{newValue?:unknown}>,area:string)=>{
   const windowId=windowRef.current;
   if(area!=='session'||windowId===undefined)return;
   if(changes[taskKey(windowId)]){
    const p=Session.safeParse(changes[taskKey(windowId)].newValue);setSession(p.success?p.data:null);
   }
   if(changes[chatKey(windowId)]){
    const p=WorkingChat.safeParse(changes[chatKey(windowId)].newValue);setChat(p.success?p.data:null);
   }
  };
  browser.storage.onChanged.addListener(listener);
  void rawMessage('CHAT_GET',{},false).then(r=>{if(mounted)setChat(WorkingChat.parse(r.chat))}).catch(()=>{});
  void send('GET_STATE');
  return()=>{mounted=false;browser.storage.onChanged.removeListener(listener)};
 },[]);
 useEffect(()=>{
   if(!research.result)return;
  void noteChat({kind:research.result.question?'question':'result',result:research.result.answer.slice(0,600),sources:research.result.sources}).catch(()=>{});
 },[research.result?.id]);
 const running=!!session&&!terminal(session);
 const busy=resetting||pending||running||guiding||preparing||listening||research.busy||!!research.review||application.busy||!!application.review;
 const changeCommand=(value:string)=>{setIntentQuestion('');setCommand(value);research.clear();application.clear();setSiteReview(null);setDraftNotice('');setError('')};
 const savedQuestion=chat?.turns.at(-1)?.note;
 const question=intentQuestion||(!session&&savedQuestion?.kind==='question'?savedQuestion.result:'');
 const phase=guiding&&!running?'thinking':siteReview?'waiting-confirmation':question?'needs-input':session?.phase??'idle';
 const result=guiding&&!running?'Preparing the task…':siteReview?'Review the destination below.':question||(session?.message??'Your result will appear here.');
 return <main className="panel">
  <header className="hero">
   <div className="brand-row"><span className="mark"><Icon name="brand"/></span><span className="eyebrow">CHROME EXTENSION</span></div>
   <h1>Browser Assistant</h1>
   <p>Read pages and navigate with your approval.</p>
   <button className="quiet" type="button" disabled={resetting||pending} onClick={()=>void resetChat()}>New chat</button>
  </header>

  <aside className="card privacy-note" aria-label="Privacy note" hidden={noticeHidden}>
   <Icon name="shield"/>
   <p>Some tasks may send your command and visible page excerpts to our online service, along with relevant recent context. Use public pages and non-confidential commands.</p>
   <button className="quiet" type="button" onClick={()=>setNoticeHidden(true)} aria-label="Hide privacy note">Hide</button>
  </aside>

  <form className="composer card" noValidate onSubmit={e=>{e.preventDefault();if(!siteReview)void run()}}>
   <label htmlFor="command">Command</label>
   <textarea id="command" maxLength={1000} placeholder="Try Scroll down or Research a topic" value={command} disabled={preparing||listening||guiding||running||research.busy||application.busy} onChange={e=>changeCommand(e.target.value)}/>
   <div className="examples" aria-label="Example commands">
    {QUICK_COMMANDS.map(label=><button className="chip" key={label} type="button" disabled={busy} onClick={()=>changeCommand(label==='YouTube in new tab'?'Open YouTube in a new tab':label)}>{label}</button>)}
   </div>
   <div className="composer-actions">
    {!siteReview&&<button className="primary" type="submit" disabled={busy||!command.trim()}>Run task <Icon name="arrow"/></button>}
    <button className="secondary mic" type="button" disabled={pending||running||guiding||preparing||research.busy||application.busy||!!application.review} onClick={()=>void dictate()} title={listening?'Stop listening':'Dictate locally (English)'} aria-label={listening?'Stop listening':'Dictate locally (English)'}><Icon name="mic"/>{listening?'Stop listening':'Dictate'}</button>
   </div>
   {draftNotice&&<p className="muted helper">{draftNotice}</p>}
  </form>

  {siteReview&&<section className="card review" aria-label="Website access review">
   <h2>Open this site in a new tab?</h2><p className="target">{siteReview.url}</p>
   <p className="muted">Chrome may ask for access to this site only. You can revoke it in the extension’s settings.</p>
   <button className="primary full" type="button" disabled={busy} onClick={()=>void run(siteReview)}>Open and continue <Icon name="arrow"/></button>
   <button className="quiet full" type="button" onClick={()=>setSiteReview(null)}>Cancel</button>
  </section>}
  <section className="card result" aria-labelledby="result-title">
   <div className="result-head"><h2 id="result-title">Task result</h2>
    <button className="quiet speech-toggle" type="button" aria-label="Speak results" aria-pressed={speakingEnabled} onClick={toggleSpeech}>Speak results: {speakingEnabled?'On':'Off'}</button>
    {(running||guiding)&&<button className="quiet stop" type="button" onClick={stop}><Icon name="stop"/>Stop task</button>}
   </div>
   <div className="result-status" role="status"><span className="phase" data-phase={phase}>{phase}</span><p className="result-message" key={phase}>{result}</p></div>
   {error&&<p className="error" role="alert">{error}</p>}
   {speechNotice&&<p className="muted helper" role="status">{speechNotice}</p>}
   {speakingEnabled&&answer&&speechNotice.startsWith('Playback needs')&&<button className="secondary" type="button" onClick={()=>playResult(answer)}>Play result</button>}
  </section>
  <ResearchCards research={research}/>
  <ApplicationCards flow={application}/>

  {session?.phase==='waiting-confirmation'&&session.videoApproval&&<section className="card review" aria-label="YouTube choices">
   <h2>Choose a YouTube result</h2>
   <ul className="choice-list">{session.videoApproval.choices.map(choice=><li key={choice.id}><button className="secondary full" type="button" disabled={pending} onClick={()=>void send('PLAY_VIDEO',{sessionId:session.id,videoId:choice.id})}>{choice.title}</button></li>)}</ul>
  </section>}
  {session?.draft&&<section className="card review" aria-label="Form draft">
   <h2>Review form draft</h2>{session.guided&&<p className="target">{new URL(session.guided.url).origin}</p>}
   <div className="draft-fields">{session.draft.map((field,i)=><div className="draft-row" key={i}><label>{field.label}
    <input disabled={draftSkipped.includes(i)} type="text" value={draftValues[i]??field.value} maxLength={160} onChange={e=>{const value=e.currentTarget.value;setDraftValues(values=>values.map((v,j)=>j===i?value:v))}}/>
   </label>
   <label className="skip-field"><input type="checkbox" checked={draftSkipped.includes(i)} onChange={()=>setDraftSkipped(prev=>prev.includes(i)?prev.filter(j=>j!==i):[...prev,i])}/> Skip {field.label}</label>
   </div>)}</div>
   <p className="muted">The site can react to entered text immediately. Review every value. Upload files and submit on the website yourself.</p>
   <button className="primary full" type="button" disabled={pending||guiding||draftValues.length!==session.draft.length||draftSkipped.length===session.draft.length||draftValues.some((x,i)=>!draftSkipped.includes(i)&&!x.trim())} onClick={()=>void send('APPROVE_GUIDED',{sessionId:session.id,values:draftValues.map((x,i)=>draftSkipped.includes(i)?null:x)})}>Fill these fields</button>
  </section>}
  {session?.review?.type==='expand'&&<section className="card review" aria-label="Disclosure review">
   <h2>Expand this section?</h2><p>{session.review.target.label}</p>
   <button className="primary full" type="button" disabled={pending} onClick={()=>void send('APPROVE_GUIDED',{sessionId:session.id})}>Expand and continue</button>
  </section>}
  {session?.review?.type==='link'&&<section className="card review" aria-label="Link review">
   <h2>Review link</h2><p>{session.review.target.label}</p><p className="target">{session.review.target.url}</p>
   <button className="primary full" type="button" disabled={pending} onClick={()=>void send('APPROVE_GUIDED',{sessionId:session.id})}>Open this link <Icon name="arrow"/></button>
  </section>}

  <SavedDetails disabled={busy} onFill={()=>{application.clear();research.clear();void send('DRAFT_PROFILE')}}/>
  <details className="card settings">
   <summary><Icon name="brand"/><span>More tools</span></summary>
   <div className="settings-body tool-stack">
    <button className="secondary" type="button" disabled={pending} onClick={()=>void send('SHOW_OVERLAY')}>Show assistant on page</button>
    <button className="secondary" type="button" disabled={busy||!command.trim()} onClick={()=>void prepare()}>{preparing?'Preparing…':'Suggest a supported command'}</button>
   </div>
  </details>
  <footer><Icon name="shield"/><span>You review links and form changes before they happen.</span></footer>
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
