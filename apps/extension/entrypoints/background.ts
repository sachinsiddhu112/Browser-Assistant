import {Request,Session,cancel,terminal,mockPlan} from '../core/session';
import {Action} from '@browser-assistant/shared';
export default defineBackground(()=>{
 const key='assistant.session';
 let queue:Promise<unknown>=Promise.resolve();
 function serial<T>(fn:()=>Promise<T>):Promise<T>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next}
 async function read(){const raw=(await browser.storage.session.get(key))[key];const parsed=Session.safeParse(raw);return parsed.success?parsed.data:null}
 async function write(s:Session){await browser.storage.session.set({[key]:s});await browser.tabs.sendMessage(s.tabId,{type:'STATE',session:s}).catch(()=>{});return s}
 async function activeTab(){const [tab]=await browser.tabs.query({active:true,currentWindow:true});if(tab?.id===undefined||!/^https?:/.test(tab.url??''))throw new Error('Select a regular website and activate the extension');return tab.id}
 async function inject(tabId:number){await browser.scripting.executeScript({target:{tabId},files:['overlay.js']})}
 // A restarted worker never resumes an uncertain task automatically.
 void serial(async()=>{const s=await read();if(s&&!terminal(s))await write({...s,phase:'error',message:'Worker restarted; start a new task'})});
 browser.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(console.error);
 browser.runtime.onMessage.addListener((raw,sender,respond)=>{
  if(sender.id!==browser.runtime.id||sender.url!==browser.runtime.getURL('sidepanel.html'))return false;
  const p=Request.safeParse(raw);if(!p.success)return false;
  void serial(async()=>{
   const req=p.data;
   if(req.type==='GET_STATE')return read();
   if(req.type==='STOP'){const s=await read();return s?write(cancel(s)):null}
   if(req.type==='SHOW_OVERLAY'){const tab=await activeTab();await inject(tab);const s=await read();if(s?.tabId===tab)await browser.tabs.sendMessage(tab,{type:'STATE',session:s}).catch(()=>{});return s}
   const old=await read();if(old&&!terminal(old))throw new Error('Stop the current task first');
   const tabId=await activeTab();await inject(tabId);
   const s=await write({id:crypto.randomUUID(),tabId,command:req.command,phase:'thinking',message:'Preparing mock plan'});
   // Timer is only a demo; recovery handles worker suspension.
   setTimeout(()=>{void serial(async()=>{const current=await read();if(current?.id!==s.id||terminal(current))return;await write({...current,phase:'acting',message:'Validating mock plan'});const plan=Action.parse(mockPlan(current.command));if(plan.type==='done')await write({...current,phase:'success',message:plan.summary})}).catch(console.error)},1200);
   return s;
  }).then(session=>respond({ok:true,session}),e=>respond({ok:false,error:e instanceof Error?e.message:'Request failed'}));
  return true;
 });
});
