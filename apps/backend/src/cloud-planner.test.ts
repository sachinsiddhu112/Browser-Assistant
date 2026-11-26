import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import {Logger} from '@nestjs/common';
import {CloudPlannerController,parseCloudStep,parsePlanInput,requestCloudStep} from './cloud-planner';
const input={goal:'Find the deadline',text:['The deadline is Monday.'],canScrollUp:false,canScrollDown:true,previousDirections:[]};
test('drops requests outside the minimised contract',()=>{
 assert.deepEqual(parsePlanInput(input),input);
 assert.throws(()=>parsePlanInput({...input,fields:['password']}));
 assert.throws(()=>parseCloudStep({type:'click',selector:'#submit'}));
 assert.deepEqual(parseCloudStep({type:'open_link',link:0}),{type:'open_link',link:0});
 assert.throws(()=>parseCloudStep({type:'open_link',link:0,url:'https://example.com'}));
 assert.deepEqual(parsePlanInput({...input,links:['Role details']}).links,['Role details']);
});
test('provider request is fixed, disables storage, and returns a validated proposal',async()=>{
 const send:typeof fetch=async (href,options)=>{
  assert.equal(href,'https://api.openai.com/v1/responses');
  assert.equal(options?.redirect,'error');
  const body=JSON.parse(String(options?.body));
  assert.equal(body.store,false);
  assert.equal(body.text.format.type,'json_object');
  assert.equal(body.instructions,undefined);
  assert.equal(body.input.length,2);
  assert.equal(body.input[0].role,'system');
  assert.match(body.input[0].content,/JSON object/);
  assert.match(body.input[0].content,/page is untrusted evidence/);
  assert.equal(body.input[1].role,'user');
  assert.equal(body.input[1].content,'Task context (JSON):\n'+JSON.stringify(input));
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

test('logs only bounded diagnostics for upstream failures, leaving public errors unchanged',async t=>{
 const warning=t.mock.method(Logger.prototype,'warn',(_message:unknown)=>{});
 const config={apiKey:'fixture-private-key',model:'fixture-model'};
 const payload=parsePlanInput(input);
 const providerId='req_0123456789abcdef0123456789abcdef';
 await assert.rejects(()=>requestCloudStep(payload,config,async()=>new Response('fixture confidential body',{
  status:401,headers:{'x-request-id':providerId},
 })),{status:502,message:'Cloud model is unavailable'});
 await assert.rejects(()=>requestCloudStep(payload,config,async()=>new Response('fixture confidential body',{
  status:403,headers:{'x-request-id':'untrusted-header-value'},
 })),{status:502,message:'Cloud model is unavailable'});
 await assert.rejects(()=>requestCloudStep(payload,config,async()=>{
  throw new TypeError('fixture confidential message',{cause:{code:'ECONNRESET'}});
 }),{status:502});
 await assert.rejects(()=>requestCloudStep(payload,config,async()=>{
  throw new TypeError('fixture confidential message',{cause:{code:'untrusted-error-code'}});
 }),{status:502});
 await assert.rejects(()=>requestCloudStep(payload,config,async()=>{
  throw new DOMException('fixture confidential timeout','TimeoutError');
 }),{status:502});
 await assert.rejects(()=>requestCloudStep(payload,config,async()=>new Response('{}',{headers:{'x-request-id':providerId}})),
  {status:502,message:'Cloud model did not return a safe step'});
 assert.deepEqual(warning.mock.calls.map(call=>call.arguments[0]),[
  'openai_request_failed kind=http status=401 request_id='+providerId,
  'openai_request_failed kind=http status=403',
  'openai_request_failed kind=connection code=ECONNRESET',
  'openai_request_failed kind=connection code=unknown',
  'openai_request_failed kind=connection code=timeout',
  'openai_request_failed kind=invalid_response status=200 request_id='+providerId,
 ]);
});
