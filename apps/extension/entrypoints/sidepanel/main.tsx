import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Session,terminal} from '../../core/session';
import './style.css';
function App(){
 const [session,setSession]=useState<Session|null>(null),[command,setCommand]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false);
 async function send(type:string,extra:object={}){
  setPending(true);setError('');
  try{const r=await browser.runtime.sendMessage({type,...extra});if(!r?.ok)throw new Error(r?.error??'No response');setSession(r.session??null)}catch(e){setError(e instanceof Error?e.message:'Request failed')}finally{setPending(false)}
 }
 useEffect(()=>{
  const listener=(changes:Record<string,{newValue?:unknown}>,area:string)=>{if(area==='session'&&changes['assistant.session']){const p=Session.safeParse(changes['assistant.session'].newValue);setSession(p.success?p.data:null)}};
  browser.storage.onChanged.addListener(listener);void send('GET_STATE');return()=>browser.storage.onChanged.removeListener(listener);
 },[]);
 const running=!!session&&!terminal(session);
 return <main><h1>Browser Assistant</h1><p>Mock execution preview</p><button disabled={pending} onClick={()=>void send('SHOW_OVERLAY')}>Show assistant on page</button><form onSubmit={e=>{e.preventDefault();void send('START',{command})}}><label htmlFor="command">Command</label><textarea id="command" maxLength={1000} value={command} onChange={e=>setCommand(e.target.value)}/><button disabled={pending||running||!command.trim()}>Run mock task</button></form><button disabled={!running} onClick={()=>void send('STOP')}>Stop task</button><p role="status">{session?.phase??'idle'}: {session?.message??'Ready'}</p>{error&&<p role="alert">{error}</p>}<small>No website actions or AI requests are performed.</small></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
