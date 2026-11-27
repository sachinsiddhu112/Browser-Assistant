import {inspectYouTubePlayer,readYouTubeChoices,sameYouTubeDestination} from '../core/youtube';
import {inspectProfileForm,matchSavedDetails,Profile,ProfileTarget,ProfileValuesKey,emptyProfile} from '../core/profile';
import {parseFormIntent} from '../core/form-intent';
import {parseSiteIntent} from '../core/site-intent';
import {Request,Session,VideoApproval,cancel,terminal} from '../core/session';
import {routeIntent,allowedNavigation,YOUTUBE_HOME} from '../core/intent';
import {Action} from '@browser-assistant/shared';
import {GUIDED_TIMEOUT_MS,splitCapture,MAX_GUIDED_STEPS,labelDraft} from '../core/guided-contract';
import {readGuidedViewport} from '../core/guided-page';
import {movePage} from '../core/scroll-motion';
export default defineBackground(()=>{
 const key='assistant.session';
 // The restriction must succeed before serving any profile operation.
 const profileAccess=Promise.resolve().then(()=>Promise.all(
  [browser.storage.local,browser.storage.session].map(area=>
   (area as typeof area & {setAccessLevel(opts:{accessLevel:'TRUSTED_CONTEXTS'}):Promise<void>}).setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})),
 )).then(()=>true,()=>false);
 let queue:Promise<unknown>=Promise.resolve();
 function serial<T>(fn:()=>Promise<T>):Promise<T>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next}
 async function read(){const p=Session.safeParse((await browser.storage.session.get(key))[key]);return p.success?p.data:null}
 async function write(s:Session){await browser.storage.session.set({[key]:s});await browser.tabs.sendMessage(s.tabId,{type:'STATE',phase:s.phase}).catch(()=>{});return s}
 async function activeTab(needsPage=true){
  const [t]=await browser.tabs.query({active:true,currentWindow:true});
  if(t?.id===undefined)throw new Error('No active Chrome tab is available');
  if(needsPage&&!/^https?:/.test(t.url??''))throw new Error('Select a regular website and activate the extension');
  return t.id;
 }
 async function inject(tabId:number){await browser.scripting.executeScript({target:{tabId},files:['/overlay.js']})}
 async function step<T>(s:Session,fn:()=>Promise<T>):Promise<T>{return serial(async()=>{const c=await read();if(c?.id!==s.id||terminal(c))throw new Error('Task stopped');return fn()})}
 async function finish(s:Session,phase:'success'|'error'|'needs-input',message:string){await serial(async()=>{const c=await read();if(c?.id===s.id&&!terminal(c))await write({...c,phase,message,videoApproval:undefined,guided:undefined,draft:undefined,review:undefined})})}
 async function waitFor<T>(s:Session,fn:()=>Promise<T|undefined>,polls=40):Promise<T>{for(let i=0;i<polls;i++){const r=await step(s,fn);if(r!==undefined)return r;await new Promise(r=>setTimeout(r,250))}throw new Error('Timed out verifying browser state')}
 async function navigate(s:Session,url:string,expectedSource?:string){
  if(!allowedNavigation(url))throw new Error('Navigation denied');
  await step(s,async()=>{
   if(expectedSource){const t=await browser.tabs.get(s.tabId);if(t.url!==expectedSource||!t.active)throw new Error('Search tab changed before playback')}
   await browser.tabs.update(s.tabId,{url});
  });await waitFor(s,async()=>{const t=await browser.tabs.get(s.tabId);return t.status==='complete'&&t.url===url?true:undefined})}
 async function execute(s:Session){
 try{
  const a=routeIntent(s.command);
  const site=!a&&parseSiteIntent(s.command);
  if(site){
   const opened=await step(s,async()=>{
    const source=await browser.tabs.get(s.tabId);
    if(!source.active)throw new Error('The active tab changed before opening the site');
    return browser.tabs.create({windowId:source.windowId,index:source.index+1,active:true,url:site.url});
   });
   if(opened.id===undefined)throw new Error('The new tab could not be verified');
   const id=opened.id;
   await step(s,async()=>write({...s,tabId:id,phase:'acting',message:'Opening the requested site'}));
   await waitFor(s,async()=>{
    const tab=await browser.tabs.get(id);
    if(tab.status!=='complete')return;
    if(!tab.active||tab.url!==site.url)throw new Error('The site redirected or the active tab changed. Check the new tab before continuing.');
    return true;
   });
   await finish(s,'success','Opened '+site.origin+' in a new tab');return;
  }
  if(!a)throw new Error('Unsupported command; try Open YouTube, Search Google for ..., Play ... on YouTube, or Scroll down');
  const action=Action.parse(a);
  await step(s,async()=>write({...s,phase:'acting',message:'Executing local skill'}));
  if(action.type==='open_youtube_tab'){
   const opened=await step(s,async()=>{
    const source=await browser.tabs.get(s.tabId);
    if(!source.active)throw new Error('Active tab changed before opening YouTube');
    return browser.tabs.create({windowId:source.windowId,index:source.index+1,active:true,url:YOUTUBE_HOME});
   });
   if(opened.id===undefined)throw new Error('The new tab could not be verified');
   const openedId=opened.id;
   await waitFor(s,async()=>{
    const tab=await browser.tabs.get(openedId);
    if(tab.status!=='complete')return;
    if(tab.url!==YOUTUBE_HOME)throw new Error('A new tab opened, but it did not load the YouTube home page. Check that tab.');
    return true;
   });
   await finish(s,'success','Opened YouTube in a new tab');return;
  }
  if(action.type==='navigate'){
   const query=new URL(action.url).searchParams.get('search_query');
   if(query&&new URL(action.url).pathname==='/results'){
    await step(s,async()=>{await browser.tabs.update(s.tabId,{url:action.url})});
    let searchSeen=false;
    try{
     const result=await waitFor(s,async()=>{
      const t=await browser.tabs.get(s.tabId);
      if(!t.active)throw new Error('The active tab changed. Switch back to YouTube and run the task again.');
      if(!sameYouTubeDestination(t.url,action.url))return;
      searchSeen=true;
      const [r]=await browser.scripting.executeScript({target:{tabId:s.tabId},func:readYouTubeChoices,args:[query]});
      const after=await browser.tabs.get(s.tabId);
      if(!after.active||!sameYouTubeDestination(after.url,action.url))throw new Error('The search changed. Start a new task.');
      return r?.result?.length&&after.url?{choices:r.result,sourceUrl:after.url}:undefined;
     },68);
     await step(s,async()=>write({...s,phase:'waiting-confirmation',message:'Choose a YouTube result to play.',videoApproval:VideoApproval.parse({...result,expiresAt:Date.now()+120_000})}));
    }catch(e){
     if(searchSeen&&e instanceof Error&&e.message==='Timed out verifying browser state')
      await finish(s,'needs-input','YouTube search is open, but I could not find a playable result. Choose the video on YouTube. Nothing started playing.');
     else if(e instanceof Error&&e.message==='Timed out verifying browser state')
      await finish(s,'error','Could not verify that the requested YouTube search loaded. Check the YouTube tab; no video was selected.');
     else throw e;
    }
    return;
   }
   await navigate(s,action.url);
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
   const scroll=await step(s,async()=>{
    const start=await browser.tabs.get(s.tabId);
    if(!start.active)throw new Error('The active tab changed before scrolling');
    await browser.scripting.executeScript({target:{tabId:s.tabId},files:['/executor.js']});
    const r=await browser.tabs.sendMessage(s.tabId,{type:'EXECUTE_ACTION',action});
    const end=await browser.tabs.get(s.tabId);
    if(!end.active||end.url!==start.url)throw new Error('The page changed while scrolling');
    if(!r?.ok||!r.result?.ok)throw new Error(r?.error??'Scroll failed');
    return r.result.scroll;
   });
   if(scroll==='interrupted')throw new Error('Scrolling was interrupted.');
   if(scroll!=='edge'&&scroll!=='moved')throw new Error('Scrolling could not be verified.');
   await finish(s,'success',scroll==='edge'?'Already at the edge of the page':'Page scrolled');return;
  }
  throw new Error('Unsupported action');
 }catch(e){await finish(s,'error',e instanceof Error?e.message:'Task failed')}
 }
 async function playVideo(s:Session,url:string,sourceUrl:string){
  try{
   if(!allowedNavigation(url))throw new Error('Navigation denied');
   const id=new URL(url).searchParams.get('v')!;
   await step(s,async()=>{
    const tab=await browser.tabs.get(s.tabId);
    if(!tab.active||!sameYouTubeDestination(tab.url,sourceUrl))throw new Error('Search tab changed before playback');
    await browser.tabs.update(s.tabId,{url});
   });
   let opened=false,attempted=false,lastTime:number|undefined;
   try{
    const result=await waitFor(s,async()=>{
     const tab=await browser.tabs.get(s.tabId);
     if(!tab.active)throw new Error('The active tab changed');
     if(!sameYouTubeDestination(tab.url,url))return;
     opened=true;
     const [r]=await browser.scripting.executeScript({target:{tabId:s.tabId},func:inspectYouTubePlayer,args:[id,!attempted]});
     const v=r?.result;
     if(v?.state==='blocked')return 'blocked';
     if(v?.state==='attempted')attempted=true;
     if(v?.state==='running'){
      const advanced=lastTime!==undefined&&v.time>lastTime+0.05;
      lastTime=v.time;
      if(advanced)return v.muted||tab.mutedInfo?.muted?'muted':'playing';
     }else lastTime=undefined;
    });
    if(result==='playing')await finish(s,'success','Selected YouTube video is playing');
    else if(result==='muted')await finish(s,'needs-input','The video is playing muted. Unmute it on YouTube to listen.');
    else await finish(s,'needs-input','The video opened, but Chrome blocked autoplay. Press Play on YouTube.');
   }catch(e){
    if(!(e instanceof Error)||e.message!=='Timed out verifying browser state')throw e;
    if(opened)await finish(s,'needs-input','Opened the selected video, but playback was not verified. Press Play on YouTube if needed.');
    else await finish(s,'error','Could not verify that the selected video opened. Check the YouTube tab.');
   }
  }catch(e){await finish(s,'error',e instanceof Error?e.message:'Could not open the selected video')}
 }
 async function verifyReviewedLink(s:Session,url:string){
  try{
   const g=s.guided;
   if(!g)throw new Error('Missing previous page');
   const fresh=await waitFor(s,async()=>{
    if(Date.now()>=g.expiresAt)throw new Error('Time limit elapsed');
    const t=await browser.tabs.get(s.tabId);
    if(!t.active)throw new Error('Active tab changed');
    if(t.status!=='complete'||t.url===g.url)return;
    if(t.url!==url)throw new Error('The site redirected');
    const [r]=await browser.scripting.executeScript({target:{tabId:s.tabId},func:readGuidedViewport});
    if(!r?.documentId||r.documentId===g.documentId)return;
    const after=await browser.tabs.get(s.tabId);
    if(!after.active||after.url!==url||after.status!=='complete')throw new Error('Page changed while reading it');
    return {documentId:r.documentId,...splitCapture(r.result)};
   });
   await step(s,async()=>write({...s,phase:'thinking',message:'Link opened. Checking the next page.',
    guided:{...g,documentId:fresh.documentId,url,fields:fresh.fields,links:fresh.links,disclosures:fresh.disclosures,
     canScrollUp:fresh.snapshot.canScrollUp,canScrollDown:fresh.snapshot.canScrollDown}}));
  }catch{await finish(s,'error','Could not verify and read the reviewed destination. Check the tab before continuing.')}
 }
 void serial(async()=>{const s=await read();if(s&&!terminal(s))await write({...s,phase:'error',message:'Worker restarted; start a new task',videoApproval:undefined,guided:undefined,draft:undefined,review:undefined})});
 browser.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(console.error);
 browser.runtime.onMessage.addListener((raw,sender,respond)=>{
  if(sender.id!==browser.runtime.id||sender.url!==browser.runtime.getURL('/sidepanel.html'))return false;
  const p=Request.safeParse(raw);if(!p.success)return false;
  void serial(async()=>{
   const req=p.data;
   if(req.type==='GET_STATE')return read();
   if(req.type==='GET_PROFILE'||req.type==='SAVE_PROFILE'||req.type==='DELETE_PROFILE'||req.type==='DRAFT_PROFILE'){
    if(!await profileAccess)throw new Error('Chrome could not protect local profile storage.');
    const tabId=await activeTab(false),tab=await browser.tabs.get(tabId);
    if(tab.incognito)throw new Error('Saved details are unavailable in incognito.');
    if(req.type==='SAVE_PROFILE'){await browser.storage.local.set({[ProfileValuesKey]:req.profile});return {profile:req.profile}}
    if(req.type==='DELETE_PROFILE'){
     await browser.storage.local.remove(ProfileValuesKey);
     const pending=await read();if(pending?.review?.type==='profile')await write(cancel(pending));
     return {profile:emptyProfile};
    }
    const profile=Profile.safeParse((await browser.storage.local.get(ProfileValuesKey))[ProfileValuesKey]);
    if(req.type==='GET_PROFILE')return {profile:profile.success?profile.data:emptyProfile};
    const old=await read();if(old&&!terminal(old))throw new Error('Stop the current task first.');
    if(!profile.success||!Object.values(profile.data).some(Boolean))throw new Error('Add your contact details under Saved details first.');
    if(!tab.url?.startsWith('https:')||(req.expectedTab&&(tabId!==req.expectedTab.id||tab.url!==req.expectedTab.url)))throw new Error('The approved page is not active.');
    const [r]=await browser.scripting.executeScript({target:{tabId},func:inspectProfileForm});
    const after=await browser.tabs.get(tabId);
    if(!r?.documentId||!after.active||after.url!==tab.url||r.result?.kind!=='profile-fields')throw new Error('The page changed while reading the form.');
    const fields=ProfileTarget.array().max(30).parse(r.result.fields);
    const items=matchSavedDetails(profile.data,fields);
    if(!items.length)throw new Error('No unambiguous empty contact fields were found in a supported form. The page is open for manual entry.');
    return {session:await write({id:crypto.randomUUID(),tabId,command:'Saved details draft',phase:'waiting-confirmation',
     message:'Review the saved details before filling. Nothing has been entered.',
     guided:{documentId:r.documentId,url:tab.url,expiresAt:Date.now()+90_000,steps:0,mode:'local',fields:[],links:[],canScrollDown:false,canScrollUp:false},
     draft:items.map(({label,value})=>({label,value})),review:{type:'profile',items}})};
   }
   if(req.type==='STOP'){const s=await read();return s?write(cancel(s)):null}
   if(req.type==='SHOW_OVERLAY'){const tab=await activeTab();await inject(tab);const s=await read();if(s?.tabId===tab)await browser.tabs.sendMessage(tab,{type:'STATE',phase:s.phase}).catch(()=>{});return s}
   if(req.type==='START'&&parseFormIntent(req.command)){
    const old=await read();
    if(old&&!terminal(old))throw new Error('Stop the current task first');
    const tabId=await activeTab(),tab=await browser.tabs.get(tabId);
    if(!tab.url?.startsWith('https:'))throw new Error('Form review is limited to HTTPS pages');
    const [r]=await browser.scripting.executeScript({target:{tabId},func:readGuidedViewport});
    const after=await browser.tabs.get(tabId);
    if(!r?.documentId||!after.active||after.url!==tab.url)throw new Error('The page changed while reading it');
    const {snapshot,fields,links}=splitCapture(r.result);
    const items=parseFormIntent(req.command)!.map(({label,value})=>{
     const matches=fields.filter(f=>f.label.toLowerCase()===label.toLowerCase());
     if(matches.length!==1)throw new Error('Could not find exactly one eligible, empty field named '+label);
     return {...matches[0],value};
    });
    return write({id:crypto.randomUUID(),tabId,command:'Form draft',phase:'waiting-confirmation',message:'Draft ready. Nothing was entered or submitted.',
     guided:{documentId:r.documentId,url:tab.url,expiresAt:Date.now()+90_000,steps:0,mode:'local',fields,links,
      canScrollDown:snapshot.canScrollDown,canScrollUp:snapshot.canScrollUp},
     draft:items.map(({label,value})=>({label,value})),review:{type:'fill',items}});
   }
   if(req.type==='START_GUIDED'||req.type==='START_CLOUD'){
    const old=await read();
    if(old&&!terminal(old))throw new Error('Stop the current task first');
    const tabId=await activeTab();
    const tab=await browser.tabs.get(tabId);
    if(req.expectedTab&&(req.expectedTab.id!==tabId||req.expectedTab.url!==tab.url||!tab.active)){
     throw new Error('The active page changed. Start the task again.');
    }
    if(!tab.url?.startsWith('https:'))throw new Error('The reader is limited to HTTPS pages');
    if(req.mode==='cloud'&&tab.incognito)throw new Error('Online assistance is disabled in incognito tabs.');
    const [captured]=await browser.scripting.executeScript({target:{tabId},func:readGuidedViewport});
    const after=await browser.tabs.get(tabId);
    if(!captured?.documentId||!after.active||after.url!==tab.url)throw new Error('The page changed while reading it; start again');
    const {snapshot,fields,links,disclosures}=splitCapture(captured.result);
    const {canScrollDown,canScrollUp}=snapshot;
    const session=await write({id:crypto.randomUUID(),tabId,command:'Guided task',phase:'thinking',message:'Reading this page',
     guided:{documentId:captured.documentId,url:tab.url,expiresAt:Date.now()+GUIDED_TIMEOUT_MS,steps:0,visited:[tab.url],fields,links,disclosures,mode:req.mode,canScrollDown,canScrollUp}});
    return {session,snapshot};
   }
   if(req.type==='RESUME_GUIDED'){
    const s=await read();
    if(!s||s.id!==req.sessionId||!s.guided||s.phase!=='thinking')throw new Error('The reviewed task cannot continue');
    const g=s.guided,t=await browser.tabs.get(s.tabId);
    if(!t.active||t.url!==g.url||Date.now()>=g.expiresAt)throw new Error('The active page or time limit changed');
    const [r]=await browser.scripting.executeScript({target:{tabId:s.tabId,documentIds:[g.documentId]},func:readGuidedViewport});
    const {snapshot,fields,links,disclosures}=splitCapture(r?.result);
    const after=await browser.tabs.get(s.tabId);
    if(!after.active||after.url!==g.url)throw new Error('The active page changed');
    return {session:await write({...s,guided:{...g,fields,links,disclosures,canScrollUp:snapshot.canScrollUp,canScrollDown:snapshot.canScrollDown}}),snapshot};
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
     if(req.values&&review.type!=='fill'&&review.type!=='profile')return failure('This review cannot accept field values.');
     if(review.type==='expand'){
      if(g.mode!=='local')return failure('Only local mode can expand a disclosure');
      const [r]=await browser.scripting.executeScript({target,func:readGuidedViewport,args:[{type:'expand',...review.target}]});
      if(r?.result?.kind!=='expanded'||!r.result.opened)return failure('The reviewed disclosure did not open.');
      return write({...s,review:undefined,phase:'thinking',message:'Disclosure opened. Checking what changed.',guided:{...g,steps:g.steps+1}});
     }
     if(review.type==='fill'||review.type==='profile'){
      if(g.mode!=='local')return failure('Cloud mode cannot enter form data');
      if(req.values&&req.values.length!==review.items.length)return failure('The edited draft no longer matches the reviewed fields.');
      const values=req.values??review.items.map(item=>item.value);
      const count=await (async()=>{
       if(review.type==='profile'){
        const items=review.items.flatMap((item,i)=>values[i]===null?[]:[{...item,value:values[i]!}]);
        if(!items.length)throw new Error('No fields selected.');
        const [r]=await browser.scripting.executeScript({target,func:inspectProfileForm,args:[items]});
        return r?.result?.kind==='profile-filled'?r.result.count:0;
       }
       const items=review.items.flatMap((item,i)=>values[i]===null?[]:[{...item,value:values[i]!}]);
       if(!items.length)throw new Error('No fields selected.');
       const [r]=await browser.scripting.executeScript({target,func:readGuidedViewport,args:[{type:'fill',items}]});
       return r?.result?.kind==='filled'?r.result.count:0;
      })();
      const expected=values.filter(v=>v!==null).length;
      if(count!==expected)return failure('Verified '+count+' of '+expected+' fields. Check the page before continuing; nothing was submitted by the extension.');
      return write({...s,...clear,phase:'success',message:'Filled '+count+' reviewed fields. You control file uploads and submission on the website.'});
     }
     const [r]=await browser.scripting.executeScript({target,func:readGuidedViewport,args:[{type:'link',...review.target}]});
     if(r?.result?.kind!=='link'||r.result.url!==review.target.url)return failure('The reviewed link is no longer available.');
     const latest=await browser.tabs.get(s.tabId);
     if(!latest.active||latest.url!==g.url)return failure('The active page changed before opening the link.');
     const next=await write({...s,review:undefined,phase:'acting',message:'Opening the reviewed link',
      guided:{...g,steps:g.steps+1,visited:[...(g.visited??[g.url]),review.target.url]}});
     await browser.tabs.update(s.tabId,{url:review.target.url});
     setTimeout(()=>{void verifyReviewedLink(next,review.target.url).catch(console.error)},0);
     return next;
    }catch{return failure('The reviewed action could not be verified. Check the page before retrying.')}
   }
   if(req.type==='STEP_GUIDED'||req.type==='FAIL_GUIDED'){
    const s=await read();
    if(!s||s.id!==req.sessionId||terminal(s)||!s.guided||(req.type==='STEP_GUIDED'&&s.phase!=='thinking'))throw new Error('The guided task is no longer active');
    const stop=(message:string)=>write({...s,phase:'error',message,guided:undefined,draft:undefined,review:undefined});
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
     const [changed]=await browser.scripting.executeScript({target,func:movePage,args:[decision.direction]});
     if(changed?.result!=='moved')throw new Error('Unable to verify scrolling. The page may have changed or the scroll was interrupted.');
     const current=await browser.tabs.get(s.tabId);
     if(!current.active||current.url!==g.url)throw new Error('The page changed while scrolling');
     const [next]=await browser.scripting.executeScript({target,func:readGuidedViewport});
     const {snapshot,fields,links,disclosures}=splitCapture(next?.result);
     const {canScrollUp,canScrollDown}=snapshot;
     const session=await write({...s,phase:'thinking',message:'Checking the latest view',guided:{...g,steps:g.steps+1,fields,links,disclosures,canScrollUp,canScrollDown}});
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
    if(decision.type==='expand'){
     const disclosure=g.disclosures?.[decision.disclosure];
     if(g.mode!=='local'||!disclosure||g.steps>=MAX_GUIDED_STEPS-1)throw new Error('No supported disclosure can be opened at this step');
     return write({...s,phase:'waiting-confirmation',message:'Review the disclosure before expanding it.',review:{type:'expand',target:disclosure}});
    }
    if(decision.type==='open_link'){
     const link=g.links[decision.link];
     if(!link)throw new Error('The model did not select a visible link');
     if(g.visited?.includes(link.url))throw new Error('That page was already visited in this task');
     if(g.steps>=MAX_GUIDED_STEPS-1)throw new Error('The task has no steps left to inspect a new page');
     return write({...s,phase:'waiting-confirmation',message:'Review the destination before opening it.',
      guided:g,review:{type:'link',target:link}});
    }
    return write({...s,phase:decision.type==='ask'?'needs-input':'answered',message:decision.type==='ask'?decision.question:decision.answer,guided:undefined});
   }
   if(req.type==='PLAY_VIDEO'){
    const s=await read();
    const approval=s?.videoApproval;
    if(s?.id!==req.sessionId||s.phase!=='waiting-confirmation'||!approval)throw new Error('There is no matching pending choice');
    const tab=await browser.tabs.get(s.tabId);
    if(approval.expiresAt<=Date.now()||!sameYouTubeDestination(tab.url,approval.sourceUrl)||!tab.active){
     return write({...s,videoApproval:undefined,phase:'error',message:'The search changed or the choice expired. Start a new task.'});
    }
    if(!approval.choices.some(c=>c.id===req.videoId))throw new Error('That video was not offered for this task');
    const next=await write({...s,videoApproval:undefined,phase:'acting',message:'Opening the selected video'});
    const url='https://www.youtube.com/watch?v='+req.videoId;
    setTimeout(()=>{void playVideo(next,url,approval.sourceUrl).catch(console.error)},0);
    return next;
   }
   const old=await read();if(old&&!terminal(old))throw new Error('Stop the current task first');
   const tabId=await activeTab(routeIntent(req.command)?.type!=='open_youtube_tab'&&!parseSiteIntent(req.command));
   if(req.expectedTab){
    const tab=await browser.tabs.get(tabId);
    if(req.expectedTab.id!==tabId||req.expectedTab.url!==tab.url||!tab.active)throw new Error('The active page changed. Run the command again.');
   }
   const s=await write({id:crypto.randomUUID(),tabId,command:req.command,phase:'thinking',message:'Routing local command'});
   setTimeout(()=>{void execute(s).catch(console.error)},0);return s;
  }).then(result=>respond(result&&('session' in result||'profile' in result)?{ok:true,...result}:{ok:true,session:result}),e=>respond({ok:false,error:e instanceof Error?e.message:'Request failed'}));return true;
 });
});
