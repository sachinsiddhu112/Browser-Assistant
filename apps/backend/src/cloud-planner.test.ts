import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import {CloudPlannerController,parseCloudStep,parsePlanInput,requestCloudStep} from './cloud-planner';
const input={goal:'Find the deadline',text:['The deadline is Monday.'],canScrollUp:false,canScrollDown:true,previousDirections:[]};
test('drops requests outside the minimised contract',()=>{
 assert.deepEqual(parsePlanInput(input),input);
 assert.throws(()=>parsePlanInput({...input,fields:['password']}));
 assert.throws(()=>parseCloudStep({type:'click',selector:'#submit'}));
});
test('provider request is fixed, disables storage, and returns a validated proposal',async()=>{
 const send:typeof fetch=async (href,options)=>{
  assert.equal(href,'https://api.openai.com/v1/responses');
  assert.equal(options?.redirect,'error');
  assert.equal(JSON.parse(String(options?.body)).store,false);
  return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"type":"finish","answer":"Monday"}'}]}]}));
 };
 assert.deepEqual(await requestCloudStep(parsePlanInput(input),{apiKey:'fake',model:'fake'},send),{type:'finish',answer:'Monday'});
});
test('disabled, unauthenticated, invalid and rate-limited calls do not reach provider',async()=>{
 const keys=['PLANNER_ACCESS_TOKEN','OPENAI_API_KEY','OPENAI_MODEL'] as const;
 const old=keys.map(k=>process.env[k]);
 const original=globalThis.fetch;
 let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"type":"ask","question":"Which page?"}'}]}]}))};
 const ctrl=new CloudPlannerController();
 try{
  for(const k of keys)delete process.env[k];
  await assert.rejects(()=>ctrl.next(undefined,input),{status:503});
  process.env.PLANNER_ACCESS_TOKEN='x'.repeat(32);
  process.env.OPENAI_API_KEY='fake';
  process.env.OPENAI_MODEL='fake';
  const auth='Bearer '+process.env.PLANNER_ACCESS_TOKEN;
  await assert.rejects(()=>ctrl.next('Bearer wrong',input),{status:401});
  await assert.rejects(()=>ctrl.next(auth,{...input,secrets:['x']}),{status:400});
  for(let i=0;i<12;i++)await ctrl.next(auth,input);
  await assert.rejects(()=>ctrl.next(auth,input),{status:429});
  assert.equal(calls,12);
 }finally{
  globalThis.fetch=original;
  keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i]});
 }
});
