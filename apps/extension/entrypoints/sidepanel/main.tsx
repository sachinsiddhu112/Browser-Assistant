import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Session,terminal} from '../../core/session';
import {startLocalDictation,suggestOnDevice} from '../../core/on-device';
import './style.css';
function App(){
 const [session,setSession]=useState<Session|null>(null),[command,setCommand]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const [preparing,setPreparing]=useState(false),[listening,setListening]=useState(false),[draftNotice,setDraftNotice]=useState('');
 const modelAbort=useRef<AbortController|null>(null),stopSpeech=useRef<(()=>void)|null>(null);
 useEffect(()=>()=>{modelAbort.current?.abort();stopSpeech.current?.()},[]);
 async function prepare(){
  if(preparing||listening||!command.trim())return;
  setPreparing(true);setError('');setDraftNotice('');
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
  setListening(true);setError('');setDraftNotice('');
  try{stopSpeech.current=await startLocalDictation(
   text=>{setCommand(text);setDraftNotice('Dictated on this device. Review the draft before running it.')},
   reason=>{stopSpeech.current=null;setListening(false);if(reason)setError(reason)},
  )}catch(e){setListening(false);setError(e instanceof Error?e.message:'Could not start dictation.')}
 }
 async function send(type:string,extra:object={}){
  setPending(true);setError('');
  try{const r=await browser.runtime.sendMessage({type,...extra});if(!r?.ok)throw new Error(r?.error??'No response');setSession(r.session??null)}catch(e){setError(e instanceof Error?e.message:'Request failed')}finally{setPending(false)}
 }
 useEffect(()=>{
  const listener=(changes:Record<string,{newValue?:unknown}>,area:string)=>{if(area==='session'&&changes['assistant.session']){const p=Session.safeParse(changes['assistant.session'].newValue);setSession(p.success?p.data:null)}};
  browser.storage.onChanged.addListener(listener);void send('GET_STATE');return()=>browser.storage.onChanged.removeListener(listener);
 },[]);
 const running=!!session&&!terminal(session);
 return <main><h1>Browser Assistant</h1><p>Local browser skills</p><button disabled={pending} onClick={()=>void send('SHOW_OVERLAY')}>Show assistant on page</button><form onSubmit={e=>{e.preventDefault();void send('START',{command})}}><label htmlFor="command">Command</label><textarea id="command" maxLength={1000} value={command} disabled={preparing||listening} onChange={e=>{setCommand(e.target.value);setDraftNotice('')}}/><button disabled={pending||running||preparing||listening||!command.trim()}>Run task</button></form><button type="button" disabled={pending||running||preparing||listening||!command.trim()} onClick={()=>void prepare()}>{preparing?'Preparing…':'Suggest supported command on device'}</button><button type="button" disabled={pending||running||preparing} onClick={()=>void dictate()}>{listening?'Stop listening':'Dictate locally (English)'}</button>{draftNotice&&<p>{draftNotice}</p>}<button disabled={!running} onClick={()=>void send('STOP')}>Stop task</button>{session?.phase==='waiting-confirmation'&&session.videoApproval&&<section aria-label="YouTube choices"><p>Choose a result from YouTube:</p><ul>{session.videoApproval.choices.map(choice=><li key={choice.id}><button type="button" disabled={pending} onClick={()=>void send('PLAY_VIDEO',{sessionId:session.id,videoId:choice.id})}>{choice.title}</button></li>)}</ul></section>}<p role="status">{session?.phase??'idle'}: {session?.message??'Ready'}</p>{error&&<p role="alert">{error}</p>}<small>Try Open YouTube, Search Google for NestJS, Play Kesariya on YouTube, Scroll down, Go back, Next tab, Inspect page, Page down, or Type NestJS into search. No AI requests are made.</small></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
