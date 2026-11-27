import React,{useEffect,useRef,useState} from 'react';
import {discoverResearchSources,parseResearch,publicResearchUrl,readResearchPage,researchSnapshot,validateResearchSources,type ResearchSource} from '../../core/research';
import {parseGuidedDecision} from '../../core/guided-contract';
import {askCloud,cloudPayload} from '../../core/cloud-client';
import {checkGuidedModel,createGuidedModel} from '../../core/guided-model';

type Plan=NonNullable<ReturnType<typeof parseResearch>>;
type Review={plan:Plan;workingChat?:string;sources:ResearchSource[];ids:number[];windowId:number};
type Answer={id:string;answer:string;question?:boolean;sources:ResearchSource[];skipped:number};

async function waitLoaded(id:number,url:string,signal:AbortSignal){
 for(let i=0;i<70;i++){
  signal.throwIfAborted();
  const tab=await browser.tabs.get(id);
  if(tab.status==='complete'&&tab.url&&tab.url!=='about:blank'){
   if(tab.url!==url)throw new Error('A page redirected away from its approved address.');
   return tab;
  }
  await new Promise(resolve=>setTimeout(resolve,140));
 }
 throw new Error('A page did not finish loading.');
}
export async function openVerified(url:string,windowId:number,active:boolean,signal:AbortSignal){
 signal.throwIfAborted();
 const tab=await browser.tabs.create({windowId,active,url:'about:blank'});
 if(tab.id===undefined)throw new Error('Could not open a research tab.');
 const id=tab.id;
 signal.throwIfAborted();
 await browser.tabs.update(id,{url});
 const verified=await waitLoaded(id,url,signal);
 if(verified.incognito)throw new Error('Research is unavailable in incognito tabs.');
 return id;
}
function captureResult(raw:unknown,url:string){
 if(!raw||typeof raw!=='object')return null;
 const r=raw as {url?:unknown;title?:unknown;text?:unknown};
 if(r.url!==url||!Array.isArray(r.text)||!r.text.length||
    r.text.length>6||!r.text.every(x=>typeof x==='string'&&x.length<=145))return null;
 return {url,title:typeof r.title==='string'&&r.title.trim()?r.title.slice(0,110):new URL(url).hostname,text:r.text as string[]};
}

export function useResearch(){
 const [review,setReview]=useState<Review|null>(null),[result,setResult]=useState<Answer|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
 const current=useRef<AbortController|null>(null);
 useEffect(()=>()=>current.current?.abort(),[]);
 const clear=()=>{setReview(null);setResult(null);setStatus('');setError('')};
 function stop(){current.current?.abort();setReview(null);setStatus('Research stopped.')}
 async function start(plan:Plan,workingChat?:string){
  if(current.current)return;
  clear();
  const ctl=new AbortController();current.current=ctl;
  try{
   const [anchor]=await browser.tabs.query({active:true,currentWindow:true});
   if(!anchor||anchor.incognito)throw new Error('Select a regular browser window before starting research.');
   ctl.signal.throwIfAborted();
   if(plan.direct.length){
    setReview({plan,workingChat,sources:plan.direct,ids:plan.direct.map((_,i)=>i),windowId:anchor.windowId});
    return;
   }
   setBusy(true);setStatus('Searching Google for public sources…');
   const url='https://www.google.com/search?q='+encodeURIComponent(plan.query);
   const id=await openVerified(url,anchor.windowId,true,ctl.signal);
   const [captured]=await browser.scripting.executeScript({target:{tabId:id},func:discoverResearchSources});
   const latest=await browser.tabs.get(id);
   ctl.signal.throwIfAborted();
   if(latest.url!==url||!latest.active||!captured?.documentId)throw new Error('The search tab changed before the results could be checked.');
   const sources=validateResearchSources(captured.result);
   if(!sources.length)throw new Error('No supported search result was visible. Try again with two or three direct public links.');
   setReview({plan,workingChat,sources,ids:[],windowId:anchor.windowId});
   setStatus('');
  }catch(e){if(!ctl.signal.aborted){setStatus('');setError(e instanceof Error?e.message:'Research could not start.')}}finally{current.current=null;setBusy(false)}
 }
 function select(index:number){
  setReview(prev=>{
   if(!prev)return null;
   const ids=prev.ids.includes(index)?prev.ids.filter(i=>i!==index):prev.ids.length<3?[...prev.ids,index]:prev.ids;
   return {...prev,ids};
  });
 }
 async function approve(){
  if(!review||!review.ids.length||current.current)return;
  const chosen=review.ids.map(i=>review.sources[i]).filter(x=>x&&publicResearchUrl(x.url)===x.url);
  if(chosen.length!==review.ids.length)return;
  const ctl=new AbortController();current.current=ctl;
  let model:Awaited<ReturnType<typeof createGuidedModel>>|undefined;
  const timer=setTimeout(()=>ctl.abort('timeout'),55_000);
  setBusy(true);setError('');setStatus('Waiting for website access…');
  try{
   const origins=[...new Set(chosen.map(x=>new URL(x.url).origin+'/*'))];
   // Must be requested directly from the user gesture. Never request wildcard access here.
   if(!await browser.permissions.request({origins}))throw new Error('Site access was not granted. Change the selected sources or try again.');
   ctl.signal.throwIfAborted();setReview(null);
   const evidence:NonNullable<ReturnType<typeof captureResult>>[]=[];
   for(const source of chosen){
    ctl.signal.throwIfAborted();
    setStatus('Reading '+new URL(source.url).hostname+'…');
    try{
     const id=await openVerified(source.url,review.windowId,false,ctl.signal);
     const [first]=await browser.scripting.executeScript({target:{tabId:id},func:readResearchPage,args:[review.plan.query]});
     const tab=await browser.tabs.get(id);
     ctl.signal.throwIfAborted();
     if(tab.url!==source.url||!first?.documentId)continue;
     const doc=captureResult(first.result,source.url);
     if(doc)evidence.push(doc);
    }catch{ctl.signal.throwIfAborted()}
   }
   if(!evidence.length)throw new Error('None of the approved pages could be read. The tabs are open for you to check.');
   setStatus('Comparing the available evidence…');
   const goal=review.plan.goal.slice(0,480)+'\nAnswer using only the numbered source excerpts. Cite Source 1, Source 2, etc. State what is missing. Return a finish answer; do not navigate.';
   if(await checkGuidedModel()==='available'){
    try{model=await createGuidedModel(ctl.signal)}catch{ctl.signal.throwIfAborted()}
   }
   ctl.signal.throwIfAborted();
   const snapshot=researchSnapshot(evidence);
   const raw=model?await model.propose(goal,{snapshot,previous:[],signal:ctl.signal,workingChat:review.workingChat}):await askCloud(cloudPayload(goal,snapshot,[],review.workingChat),ctl.signal);
   ctl.signal.throwIfAborted();
   const decision=parseGuidedDecision(raw);
   if(decision.type!=='finish'&&decision.type!=='ask')throw new Error('The assistant did not return a readable comparison.');
   setResult({id:crypto.randomUUID(),question:decision.type==='ask',answer:decision.type==='finish'?decision.answer:decision.question,skipped:chosen.length-evidence.length,sources:evidence.map(({title,url})=>({title,url}))});
   setStatus('');
  }catch(e){
   if(ctl.signal.reason==='timeout')setError('Research timed out. Try fewer sources.');
   else if(!ctl.signal.aborted)setError(e instanceof Error?e.message:'Could not finish research.');
   if(!ctl.signal.aborted||ctl.signal.reason==='timeout')setStatus('');
  }finally{clearTimeout(timer);model?.close();current.current=null;setBusy(false)}
 }
 return {review,result,busy,error,status,start,stop,clear,select,approve};
}

export function ResearchCards({research}:{research:ReturnType<typeof useResearch>}){
 const {review,result,status,error,busy}=research;
 return <>
  {review&&<section className="card review" aria-label="Research sources">
   <h2>Choose sources to read</h2>
   <p className="muted">Choose up to three public pages. Only the sites you approve will be read.</p>
   <ul className="choice-list">{review.sources.map((source,i)=><li key={source.url}><label className="research-choice">
    <input type="checkbox" checked={review.ids.includes(i)} disabled={busy||(!review.ids.includes(i)&&review.ids.length>=3)} onChange={()=>research.select(i)}/>
    <span>{source.title}<small>{source.url}</small></span>
   </label></li>)}</ul>
   <button type="button" className="primary full" disabled={busy||!review.ids.length} onClick={()=>void research.approve()}>Open and read selected sources</button>
   <button type="button" className="quiet full" onClick={research.stop}>Cancel research</button>
  </section>}
  {(status||result||error)&&<section className="card review" aria-label="Research result">
   <div className="result-head"><h2>Research result</h2>{busy&&<button type="button" className="quiet stop" onClick={research.stop}>Stop research</button>}</div>
   {status&&<p role="status">{status}</p>}
   {error&&<p role="alert" className="error">{error}</p>}
   {result&&<>
    <p className="research-answer">{result.answer}</p>
    {result.skipped>0&&<p className="muted">{result.skipped} approved {result.skipped===1?'page was':'pages were'} unavailable and not used.</p>}
    <ol className="research-links">{result.sources.map(s=><li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a><small>{new URL(s.url).hostname}</small></li>)}</ol>
   </>}
  </section>}
 </>;
}
