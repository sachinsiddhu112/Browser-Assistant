import {MAX_GUIDED_STEPS,parseGuidedDecision,type GuidedDecision,type GuidedSnapshot} from './guided-contract';

export interface GuidedTransport {
  begin():Promise<{sessionId:string;snapshot:GuidedSnapshot}>;
  step(sessionId:string, decision:GuidedDecision):Promise<GuidedSnapshot|undefined>;
  fail(sessionId:string):Promise<void>;
}

export async function runGuided(
  transport:GuidedTransport,
  propose:(input:{snapshot:GuidedSnapshot;previous:GuidedDecision[];signal:AbortSignal})=>Promise<string>,
  signal:AbortSignal,
){
 signal.throwIfAborted();
 const started=await transport.begin();
 try{
  let snapshot=started.snapshot;
  const previous:GuidedDecision[]=[];
  for(let i=0;i<MAX_GUIDED_STEPS;i++){
   signal.throwIfAborted();
   const decision=parseGuidedDecision(await propose({snapshot,previous:previous.slice(),signal}));
   signal.throwIfAborted();
   const next=await transport.step(started.sessionId,decision);
   if(decision.type!=='scroll')return;
   if(!next)throw new Error('The extension could not verify a fresh view after scrolling.');
   snapshot=next;
   previous.push(decision);
  }
  throw new Error('The task reached its step limit. Review the page and try a narrower request.');
 }catch(error){
  await transport.fail(started.sessionId).catch(()=>{});
  throw error;
 }
}
