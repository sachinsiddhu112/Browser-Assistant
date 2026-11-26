import {Request,Session,VideoApproval,cancel,terminal} from '../core/session';
import {routeIntent,allowedNavigation} from '../core/intent';
import {Action} from '@browser-assistant/shared';
import {GUIDED_TIMEOUT_MS,splitCapture,MAX_GUIDED_STEPS,labelDraft} from '../core/guided-contract';
import {readGuidedViewport,scrollGuidedViewport} from '../core/guided-page';
export default defineBackground(()=>{
 const key='assistant.session';
 let queue:Promise<unknown>=Promise.resolve();
 function serial<T>(fn:()=>Promise<T>):Promise<T>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next}
 async function read(){const p=Session.safeParse((await browser.storage.session.get(key))[key]);return p.success?p.data:null}
 async function write(s:Session){await browser.storage.session.set({[key]:s});await browser.tabs.sendMessage(s.tabId,{type:'STATE',phase:s.phase}).catch(()=>{});return s}
 async function activeTab(){const [t]=await browser.tabs.query({active:true,currentWindow:true});if(t?.id===undefined||!/^https?:/.test(t.url??''))throw new Error('Select a regular website and activate the extension');return t.id}
 async function inject(tabId:number){await browser.scripting.executeScript({target:{tabId},files:['/overlay.js']})}
 async function step<T>(s:Session,fn:()=>Promise<T>):Promise<T>{return serial(async()=>{const c=await read();if(c?.id!==s.id||terminal(c))throw new Error('Task stopped');return fn()})}
 async function finish(s:Session,phase:'success'|'error',message:string){await serial(async()=>{const c=await read();if(c?.id===s.id&&!terminal(c))await write({...c,phase,message,videoApproval:undefined})})}
 async function waitFor<T>(s:Session,fn:()=>Promise<T|undefined>):Promise<T>{for(let i=0;i<40;i++){const r=await step(s,fn);if(r!==undefined)return r;await new Promise(r=>setTimeout(r,250))}throw new Error('Timed out verifying browser state')}
 async function navigate(s:Session,url:string,expectedSource?:string){
  if(!allowedNavigation(url))throw new Error('Navigation denied');
  await step(s,async()=>{
   if(expectedSource){const t=await browser.tabs.get(s.tabId);if(t.url!==expectedSource||!t.active)throw new Error('Search tab changed before playback')}
   await browser.tabs.update(s.tabId,{url});
  });await waitFor(s,async()=>{const t=await browser.tabs.get(s.tabId);return t.status==='complete'&&t.url===url?true:undefined})}
 async function execute(s:Session){
 try{
  const a=routeIntent(s.command);if(!a)throw new Error('Unsupported command; try Open YouTube, Search Google for ..., Play ... on YouTube, or Scroll down');
  const action=Action.parse(a);
  await step(s,async()=>write({...s,phase:'acting',message:'Executing local skill'}));
  if(action.type==='navigate'){
   await navigate(s,action.url);
   if(new URL(action.url).pathname==='/results'){
    const choices=await waitFor(s,async()=>{
     const t=await browser.tabs.get(s.tabId);if(t.url!==action.url||!t.active)throw new Error('Search tab changed');
     const [r]=await browser.scripting.executeScript({target:{tabId:s.tabId},func:()=>{
      if(location.origin!=='https://www.youtube.com'||location.pathname!=='/results')return [];
      const choices:{id:string;title:string}[]=[];
      for(const a of document.querySelectorAll<HTMLAnchorElement>('ytd-video-renderer a#video-title[href]')){
       if(!a.getClientRects().length||getComputedStyle(a).visibility!=='visible'||a.closest('[hidden],[inert],[aria-hidden="true"]'))continue;
       const u=new URL(a.href),id=u.searchParams.get('v');
       const title=(a.textContent??'').replace(/\s+/g,' ').trim().slice(0,160);
       if(u.origin==='https://www.youtube.com'&&u.pathname==='/watch'&&id&&/^[\w-]{11}$/.test(id)&&title&&!choices.some(x=>x.id===id))choices.push({id,title});
       if(choices.length===4)break;
      }
      return choices;
     }});
     const choices=r?.result??[];return choices.length?choices:undefined;
    });
    await step(s,async()=>write({...s,phase:'waiting-confirmation',message:'Choose a YouTube result to play.',videoApproval:VideoApproval.parse({sourceUrl:action.url,expiresAt:Date.now()+120_000,choices})}));
    return;
   }
   await finish(s,'success','Page opened');return;
  }
  if(action.type==='go_back'){
   const before=await step(s,()=>browser.tabs.get(s.tabId));
   await step(s,()=>browser.tabs.goBack(s.tabId));
   await waitFor(s,async()=>{const t=await browser.tabs.get(s.tabId);return t.status==='complete'&&t.url!==before.url?true:undefined});
   await finish(s,'success','Returned to previous page');return;
  }
  if(action.type==='switch_tab'){
   await step(s,async()=>{const current=await browser.tabs.get(s.tabId);const tabs=(await browser.tabs.query({windowId:current.windowId})).sort((a,b)=>a.index-b.index);const i=tabs.findIndex(t=>t.id===s.tabId);if(i<0||tabs.length<2)throw new Error('No other tab');const target=tabs[(i+(action.direction==='next'?1:tabs.length-1))%tabs.length];if(target.id===undefined)throw new Error('Tab unavailable');const updated=await browser.tabs.update(target.id,{active:true});if(!updated?.active)throw new Error('Tab switch not verified')});
   await finish(s,'success','Switched tab');return;
  }
  if(action.type==='type'){
   await step(s,async()=>{
    await browser.scripting.executeScript({target:{tabId:s.tabId},files:['/executor.js']});
    const r=await browser.tabs.sendMessage(s.tabId,{type:'OBSERVE_PAGE'});
    if(!r?.ok||!Array.isArray(r.result?.elements))throw new Error('Observation failed');
    const candidates=r.result.elements.filter((e:{inputType?:string})=>e.inputType==='search');
    if(candidates.length!==1)throw new Error('Exactly one visible search input is required');
    const result=await browser.tabs.sendMessage(s.tabId,{type:'EXECUTE_ACTION',action:{...action,elementId:candidates[0].id,snapshotId:r.result.snapshotId}});
    if(!result?.ok||!result.result?.ok)throw new Error(result?.error??'Typing not verified');
   });
   await finish(s,'success','Search input filled without submitting');return;
  }
  if(action.type==='observe'){
   const count=await step(s,async()=>{await browser.scripting.executeScript({target:{tabId:s.tabId},files:['/executor.js']});const r=await browser.tabs.sendMessage(s.tabId,{type:'OBSERVE_PAGE'});if(!r?.ok||!Array.isArray(r.result?.elements))throw new Error('Observation failed');return r.result.elements.length});
   await finish(s,'success','Observed '+count+' interactive elements');return;
  }
  if(action.type==='scroll'||action.type==='press_key'){
   await step(s,async()=>{await browser.scripting.executeScript({target:{tabId:s.tabId},files:['/executor.js']});const r=await browser.tabs.sendMessage(s.tabId,{type:'EXECUTE_ACTION',action});if(!r?.ok)throw new Error(r?.error??'Scroll failed')});
   await finish(s,'success','Scroll requested');return;
  }
  throw new Error('Unsupported action');
 }catch(e){await finish(s,'error',e instanceof Error?e.message:'Task failed')}
 }
 async function playVideo(s:Session,url:string,sourceUrl:string){
  try{
   await navigate(s,url,sourceUrl);
   try{
    await waitFor(s,async()=>{
     const t=await browser.tabs.get(s.tabId);if(t.url!==url||!t.active)throw new Error('Video tab changed');
     const [r]=await browser.scripting.executeScript({target:{tabId:s.tabId},func:()=>{
      const video=document.querySelector<HTMLVideoElement>('video');
      return !!video&&!video.paused&&!video.ended&&video.currentTime>0&&!document.querySelector('.html5-video-player.ad-showing');
     }});return r?.result?true:undefined;
    });
   }catch{await finish(s,'success','Opened the selected video, but playback was not verified. Press Play on YouTube if needed.');return}
   await finish(s,'success','Selected YouTube video is playing');
  }catch(e){await finish(s,'error',e instanceof Error?e.message:'Could not open the selected video')}
 }
 async function verifyReviewedLink(s:Session,url:string){
  try{
   await waitFor(s,async()=>{const t=await browser.tabs.get(s.tabId);return t.status==='complete'&&t.url===url?true:undefined});
   await finish(s,'success','Opened the reviewed link. You can run another task on this page.');
  }catch{await finish(s,'error','Could not verify the exact destination. Check the tab before continuing.')}
 }
 void serial(async()=>{const s=await read();if(s&&!terminal(s))await write({...s,phase:'error',message:'Worker restarted; start a new task',videoApproval:undefined,guided:undefined,draft:undefined,review:undefined})});
 browser.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(console.error);
 browser.runtime.onMessage.addListener((raw,sender,respond)=>{
  if(sender.id!==browser.runtime.id||sender.url!==browser.runtime.getURL('/sidepanel.html'))return false;
  const p=Request.safeParse(raw);if(!p.success)return false;
  void serial(async()=>{
   const req=p.data;
   if(req.type==='GET_STATE')return read();
   if(req.type==='STOP'){const s=await read();return s?write(cancel(s)):null}
   if(req.type==='SHOW_OVERLAY'){const tab=await activeTab();await inject(tab);const s=await read();if(s?.tabId===tab)await browser.tabs.sendMessage(tab,{type:'STATE',phase:s.phase}).catch(()=>{});return s}
   if(req.type==='START_GUIDED'||req.type==='START_CLOUD'){
    const old=await read();
    if(old&&!terminal(old))throw new Error('Stop the current task first');
    const tabId=await activeTab();
    const tab=await browser.tabs.get(tabId);
    if(req.mode==='cloud'&&(req.expectedTab.id!==tabId||req.expectedTab.url!==tab.url||!tab.active)){
     throw new Error('The active page changed before sharing. Start the task again.');
    }
    if(!tab.url?.startsWith('https:'))throw new Error('The AI reader is limited to HTTPS pages');
    const [captured]=await browser.scripting.executeScript({target:{tabId},func:readGuidedViewport});
    const after=await browser.tabs.get(tabId);
    if(!captured?.documentId||!after.active||after.url!==tab.url)throw new Error('The page changed while reading it; start again');
    const {snapshot,fields,links}=splitCapture(captured.result);
    const {canScrollDown,canScrollUp}=snapshot;
    const session=await write({id:crypto.randomUUID(),tabId,command:req.mode==='cloud'?'Cloud task':'On-device task',phase:'thinking',message:req.mode==='cloud'?'Reading the approved page for cloud planning':'Reading this page on your device',
     guided:{documentId:captured.documentId,url:tab.url,expiresAt:Date.now()+GUIDED_TIMEOUT_MS,steps:0,fields,links,mode:req.mode,canScrollDown,canScrollUp}});
    return {session,snapshot};
   }
   if(req.type==='APPROVE_GUIDED'){
    const s=await read();
    if(!s||s.id!==req.sessionId||s.phase!=='waiting-confirmation'||!s.guided||!s.review)throw new Error('No matching action to approve');
    const {review,guided:g}=s;
    const clear={guided:undefined,review:undefined,draft:undefined};
    const failure=(message:string)=>write({...s,...clear,phase:'error',message});
    try{
     const t=await browser.tabs.get(s.tabId);
     if(!t.active||t.url!==g.url||Date.now()>=g.expiresAt)return failure('The page or review expired. Start again.');
     const target={tabId:s.tabId,documentIds:[g.documentId]};
     if(review.type==='fill'){
      if(g.mode!=='local')return failure('Cloud mode cannot enter form data');
      const [r]=await browser.scripting.executeScript({target,func:readGuidedViewport,args:[{type:'fill',items:review.items}]});
      const count=r?.result?.kind==='filled'?r.result.count:0;
      if(count!==review.items.length)return failure('Verified '+count+' of '+review.items.length+' fields. Check the page before continuing; nothing was submitted by the extension.');
      return write({...s,...clear,phase:'success',message:'Filled '+count+' reviewed fields. You control file uploads and submission on the website.'});
     }
     const [r]=await browser.scripting.executeScript({target,func:readGuidedViewport,args:[{type:'link',...review.target}]});
     if(r?.result?.kind!=='link'||r.result.url!==review.target.url)return failure('The reviewed link is no longer available.');
     const latest=await browser.tabs.get(s.tabId);
     if(!latest.active||latest.url!==g.url)return failure('The active page changed before opening the link.');
     const next=await write({...s,...clear,phase:'acting',message:'Opening the reviewed link'});
     await browser.tabs.update(s.tabId,{url:review.target.url});
     setTimeout(()=>{void verifyReviewedLink(next,review.target.url).catch(console.error)},0);
     return next;
    }catch{return failure('The reviewed action could not be verified. Check the page before retrying.')}
   }
   if(req.type==='STEP_GUIDED'||req.type==='FAIL_GUIDED'){
    const s=await read();
    if(!s||s.id!==req.sessionId||terminal(s)||s.phase==='waiting-confirmation'||!s.guided)throw new Error('The guided task is no longer active');
    const stop=(message:string)=>write({...s,phase:'error',message,guided:undefined});
    if(req.type==='FAIL_GUIDED')return stop('The guided task ended without a result');
    const g=s.guided;
    const tab=await browser.tabs.get(s.tabId);
    if(Date.now()>=g.expiresAt||g.steps>=MAX_GUIDED_STEPS||!tab.active||tab.url!==g.url){
     await stop('The page, active tab, or time limit changed. Start again.');throw new Error('The page changed or the guided task expired');
    }
    const target={tabId:s.tabId,documentIds:[g.documentId]};
    const decision=req.decision;
    if(decision.type==='scroll'){
     if(!(decision.direction==='down'?g.canScrollDown:g.canScrollUp))throw new Error('There is no more page in that direction');
     await write({...s,phase:'acting',message:'Scrolling to check the next part of the page',guided:{...g,steps:g.steps+1}});
     const [changed]=await browser.scripting.executeScript({target,func:scrollGuidedViewport,args:[decision.direction]});
     if(!changed?.result)throw new Error('Scrolling did not change the page');
     const [next]=await browser.scripting.executeScript({target,func:readGuidedViewport});
     const {snapshot,fields,links}=splitCapture(next?.result);
     const {canScrollUp,canScrollDown}=snapshot;
     const session=await write({...s,phase:'thinking',message:'Checking the latest view',guided:{...g,steps:g.steps+1,fields,links,canScrollUp,canScrollDown}});
     return {session,snapshot};
    }
    // Verify the original document still exists before showing a model result.
    await browser.scripting.executeScript({target,func:()=>true});
    if(decision.type==='draft'){
     if(g.mode!=='local')throw new Error('Only local mode can propose form fields');
     const draft=labelDraft(g.fields.map(f=>f.label),decision.entries);
     const items=decision.entries.map((entry,i)=>({...g.fields[entry.field],value:draft[i].value}));
     return write({...s,phase:'waiting-confirmation',message:'Draft ready. Nothing was entered or submitted.',draft,
      guided:{...g,expiresAt:Date.now()+90_000},review:{type:'fill',items}});
    }
    if(decision.type==='open_link'){
     const link=g.links[decision.link];
     if(!link)throw new Error('The model did not select a visible link');
     return write({...s,phase:'waiting-confirmation',message:'Review the destination before opening it.',
      guided:{...g,expiresAt:Date.now()+90_000},review:{type:'link',target:link}});
    }
    return write({...s,phase:'success',message:decision.type==='ask'?decision.question:decision.answer,guided:undefined});
   }
   if(req.type==='PLAY_VIDEO'){
    const s=await read();
    const approval=s?.videoApproval;
    if(s?.id!==req.sessionId||s.phase!=='waiting-confirmation'||!approval)throw new Error('There is no matching pending choice');
    const tab=await browser.tabs.get(s.tabId);
    if(approval.expiresAt<=Date.now()||tab.url!==approval.sourceUrl||!tab.active){
     return write({...s,videoApproval:undefined,phase:'error',message:'The search changed or the choice expired. Start a new task.'});
    }
    if(!approval.choices.some(c=>c.id===req.videoId))throw new Error('That video was not offered for this task');
    const next=await write({...s,videoApproval:undefined,phase:'acting',message:'Opening the selected video'});
    const url='https://www.youtube.com/watch?v='+req.videoId;
    setTimeout(()=>{void playVideo(next,url,approval.sourceUrl).catch(console.error)},0);
    return next;
   }
   const old=await read();if(old&&!terminal(old))throw new Error('Stop the current task first');
   const tabId=await activeTab();const s=await write({id:crypto.randomUUID(),tabId,command:req.command,phase:'thinking',message:'Routing local command'});
   setTimeout(()=>{void execute(s).catch(console.error)},0);return s;
  }).then(result=>respond(result&&'session' in result?{ok:true,...result}:{ok:true,session:result}),e=>respond({ok:false,error:e instanceof Error?e.message:'Request failed'}));return true;
 });
});
