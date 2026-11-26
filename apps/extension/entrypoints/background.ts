import {Request,Session,cancel,terminal} from '../core/session';
import {routeIntent,allowedNavigation} from '../core/intent';
import {Action} from '@browser-assistant/shared';
export default defineBackground(()=>{
 const key='assistant.session';
 let queue:Promise<unknown>=Promise.resolve();
 function serial<T>(fn:()=>Promise<T>):Promise<T>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next}
 async function read(){const p=Session.safeParse((await browser.storage.session.get(key))[key]);return p.success?p.data:null}
 async function write(s:Session){await browser.storage.session.set({[key]:s});await browser.tabs.sendMessage(s.tabId,{type:'STATE',session:s}).catch(()=>{});return s}
 async function activeTab(){const [t]=await browser.tabs.query({active:true,currentWindow:true});if(t?.id===undefined||!/^https?:/.test(t.url??''))throw new Error('Select a regular website and activate the extension');return t.id}
 async function inject(tabId:number){await browser.scripting.executeScript({target:{tabId},files:['/overlay.js']})}
 async function step<T>(s:Session,fn:()=>Promise<T>):Promise<T>{return serial(async()=>{const c=await read();if(c?.id!==s.id||terminal(c))throw new Error('Task stopped');return fn()})}
 async function finish(s:Session,phase:'success'|'error',message:string){await serial(async()=>{const c=await read();if(c?.id===s.id&&!terminal(c))await write({...c,phase,message})})}
 async function waitFor<T>(s:Session,fn:()=>Promise<T|undefined>):Promise<T>{for(let i=0;i<40;i++){const r=await step(s,fn);if(r!==undefined)return r;await new Promise(r=>setTimeout(r,250))}throw new Error('Timed out verifying browser state')}
 async function navigate(s:Session,url:string){if(!allowedNavigation(url))throw new Error('Navigation denied');await step(s,()=>browser.tabs.update(s.tabId,{url}));await waitFor(s,async()=>{const t=await browser.tabs.get(s.tabId);return t.status==='complete'&&t.url===url?true:undefined})}
 async function execute(s:Session){
 try{
  const a=routeIntent(s.command);if(!a)throw new Error('Unsupported command; try Open YouTube, Search Google for ..., Play ... on YouTube, or Scroll down');
  const action=Action.parse(a);
  await step(s,async()=>write({...s,phase:'acting',message:'Executing local skill'}));
  if(action.type==='navigate'){
   await navigate(s,action.url);
   if(new URL(action.url).pathname==='/results'){
    const candidate=await waitFor(s,async()=>{
     const t=await browser.tabs.get(s.tabId);if(t.url!==action.url)throw new Error('Page changed');
     const [r]=await browser.scripting.executeScript({target:{tabId:s.tabId},func:()=>{
      const a=Array.from(document.querySelectorAll<HTMLAnchorElement>('ytd-video-renderer a#video-title[href]')).find(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0);
      if(!a)return null;const u=new URL(a.href);const v=u.searchParams.get('v');return u.origin==='https://www.youtube.com'&&u.pathname==='/watch'&&v&&/^[\w-]{11}$/.test(v)?'https://www.youtube.com/watch?v='+v:null;
     }});return r?.result??undefined;
    });
    await navigate(s,candidate);
    await waitFor(s,async()=>{const t=await browser.tabs.get(s.tabId);if(t.url!==candidate)throw new Error('Page changed');const [r]=await browser.scripting.executeScript({target:{tabId:s.tabId},func:()=>{const v=document.querySelector('video');return !!v&&!v.paused&&v.currentTime>0}});return r?.result?true:undefined});
    await finish(s,'success','First YouTube result is playing');return;
   }
   await finish(s,'success','Page opened');return;
  }
  if(action.type==='scroll'){
   await step(s,async()=>{await browser.scripting.executeScript({target:{tabId:s.tabId},files:['/executor.js']});const r=await browser.tabs.sendMessage(s.tabId,{type:'EXECUTE_ACTION',action});if(!r?.ok)throw new Error(r?.error??'Scroll failed')});
   await finish(s,'success','Scroll requested');return;
  }
  throw new Error('Unsupported action');
 }catch(e){await finish(s,'error',e instanceof Error?e.message:'Task failed')}
 }
 void serial(async()=>{const s=await read();if(s&&!terminal(s))await write({...s,phase:'error',message:'Worker restarted; start a new task'})});
 browser.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(console.error);
 browser.runtime.onMessage.addListener((raw,sender,respond)=>{
  if(sender.id!==browser.runtime.id||sender.url!==browser.runtime.getURL('/sidepanel.html'))return false;
  const p=Request.safeParse(raw);if(!p.success)return false;
  void serial(async()=>{
   const req=p.data;
   if(req.type==='GET_STATE')return read();
   if(req.type==='STOP'){const s=await read();return s?write(cancel(s)):null}
   if(req.type==='SHOW_OVERLAY'){const tab=await activeTab();await inject(tab);const s=await read();if(s?.tabId===tab)await browser.tabs.sendMessage(tab,{type:'STATE',session:s}).catch(()=>{});return s}
   const old=await read();if(old&&!terminal(old))throw new Error('Stop the current task first');
   const tabId=await activeTab();const s=await write({id:crypto.randomUUID(),tabId,command:req.command,phase:'thinking',message:'Routing local command'});
   setTimeout(()=>{void execute(s).catch(console.error)},0);return s;
  }).then(session=>respond({ok:true,session}),e=>respond({ok:false,error:e instanceof Error?e.message:'Request failed'}));return true;
 });
});
