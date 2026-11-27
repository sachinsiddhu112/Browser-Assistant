import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import {Logger} from '@nestjs/common';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {IncomingMessage} from 'node:http';
import {PlannerBudget,plannerClientIp} from './planner-budget';
import {CloudPlannerController,parseCloudStep,parsePlanInput,parseCloudIntent,parseIntentInput,requestCloudStep} from './cloud-planner';
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

test('10 calls per IP in a rolling minute and the UTC day cap survive reopening',()=>{
 const dir=mkdtempSync(join(tmpdir(),'browser-budget-'));
 const path=join(dir,'budget.sqlite');
 try{
  const start=Date.UTC(2026,10,26,12);
  const first=new PlannerBudget(path);
  try{
   for(let i=0;i<10;i++)assert.equal(first.take('192.0.2.1',12,start+i),'ok');
   assert.equal(first.take('192.0.2.1',12,start+59_999),'ip');
   assert.equal(first.take('192.0.2.2',12,start+59_999),'ok');
  }finally{first.close()}
  const second=new PlannerBudget(path);
  try{
   assert.equal(second.take('192.0.2.1',12,start+59_999),'ip');
   assert.equal(second.take('192.0.2.1',12,start+60_000),'ok');
   assert.equal(second.take('192.0.2.3',12,start+60_000),'daily');
   assert.equal(second.take('192.0.2.3',12,start+12*60*60_000),'ok');
  }finally{second.close()}
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('Railway uses the edge client address or fails closed; local ignores forwarded headers',()=>{
 assert.equal(plannerClientIp({'x-real-ip':'::ffff:192.0.2.1','x-forwarded-for':'203.0.113.7'},'127.0.0.1',true),'192.0.2.1');
 assert.equal(plannerClientIp({'x-real-ip':'2001:0db8:0:0:0:0:0:1'},undefined,true),'2001:db8::1');
 assert.equal(plannerClientIp({'x-real-ip':'192.0.2.1, 192.0.2.2'},'127.0.0.1',true),undefined);
 assert.equal(plannerClientIp({'x-forwarded-for':'192.0.2.1'},'127.0.0.1',true),undefined);
 assert.equal(plannerClientIp({'x-real-ip':'192.0.2.1'},'127.0.0.1',false),'127.0.0.1');
});

test('anonymous planner is opt-in and never calls provider without a usable budget',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'browser-budget-controller-'));
 const keys=['PLANNER_ACCESS_TOKEN','OPENAI_API_KEY','OPENAI_MODEL','PLANNER_PUBLIC_ENABLED','PLANNER_DAILY_CALL_CAP','PLANNER_BUDGET_DIR','RAILWAY_ENVIRONMENT_ID','RAILWAY_VOLUME_MOUNT_PATH'] as const;
 const old=keys.map(k=>process.env[k]);
 const original=globalThis.fetch;
 const ctrl=new CloudPlannerController();
 let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"type":"finish","answer":"Monday"}'}]}]}))};
 const request=(ip:string)=>({headers:{'x-real-ip':ip},socket:{remoteAddress:ip} as IncomingMessage['socket']});
 try{
  for(const k of keys)delete process.env[k];
  Object.assign(process.env,{OPENAI_API_KEY:'fixture',OPENAI_MODEL:'fixture',PLANNER_ACCESS_TOKEN:'a'.repeat(32)});
  await assert.rejects(()=>ctrl.next(undefined,input,request('192.0.2.1')),{status:401});
  process.env.PLANNER_PUBLIC_ENABLED='true';
  await assert.rejects(()=>ctrl.next(undefined,input,request('192.0.2.1')),{status:503});
  process.env.PLANNER_DAILY_CALL_CAP='13';
  process.env.PLANNER_BUDGET_DIR=join(dir,'not-mounted');
  await assert.rejects(()=>ctrl.next(undefined,input,request('192.0.2.1')),{status:503});
  assert.equal(calls,0);
  process.env.PLANNER_BUDGET_DIR=dir;
  await assert.rejects(()=>ctrl.next(undefined,{...input,extra:true},request('192.0.2.1')),{status:400});
  for(let i=0;i<10;i++)await ctrl.next(undefined,input,request('192.0.2.1'));
  await assert.rejects(()=>ctrl.next(undefined,input,request('192.0.2.1')),{status:429,message:'Per-IP limit reached (10 requests per minute)'});
  for(let i=0;i<3;i++)await ctrl.next(undefined,input,request('192.0.2.2'));
  await assert.rejects(()=>ctrl.next('Bearer '+process.env.PLANNER_ACCESS_TOKEN,input,request('192.0.2.3')),
   {status:429,message:'Public planner daily limit reached'});
  assert.equal(calls,13);
 }finally{
  ctrl.onModuleDestroy();
  globalThis.fetch=original;
  keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i]});
  rmSync(dir,{recursive:true,force:true});
 }
});

test('intent mode excludes page data and validates indexed destinations and skills',async()=>{
 const intent={mode:'intent',goal:'Open the docs in a separate tab',sites:['docs.example.org']};
 assert.deepEqual(parseIntentInput(intent),intent);
 assert.throws(()=>parseIntentInput({...intent,text:['page prompt']}));
 assert.throws(()=>parseIntentInput({...intent,sites:['https://example.org/secret']}));
 assert.throws(()=>parseCloudIntent({intent:'open_site',target:1},1));
 assert.throws(()=>parseCloudIntent({intent:'open_site',target:0,url:'https://external.example/'},1));
 assert.throws(()=>parseCloudIntent({intent:'submit'},1));
 assert.deepEqual(parseCloudIntent({intent:'job',args:['Backend Engineer','Acme','Noida']},0),{intent:'job',args:['Backend Engineer','Acme','Noida']});
 assert.throws(()=>parseCloudIntent({intent:'job',args:['Backend Engineer']},0));
 assert.throws(()=>parseCloudIntent({intent:'google_search',args:['one','two']},0));
 const send:typeof fetch=async(_href,options)=>{
  const body=JSON.parse(String(options?.body));
  assert.match(body.input[0].content,/Classify one browser request/);
  assert.match(body.input[1].content,/docs.example.org/);
  return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"intent":"open_site","target":0}'}]}]}));
 };
 assert.deepEqual(await requestCloudStep(parseIntentInput(intent),{apiKey:'fake',model:'fake'},send),{intent:'open_site',target:0});
});

test('accepts bounded working context without changing legacy callers',()=>{
 const workingChat=JSON.stringify({recent:[{request:'Find the date',kind:'question',output:'Which date?'}],pending:{request:'Find the date',question:'Which date?'}});
 const data={mode:'intent',goal:'The registration deadline',sites:[],workingChat};
 assert.deepEqual(parseIntentInput(data),data);
 assert.equal(parsePlanInput({...input,workingChat}).workingChat,workingChat);
 assert.throws(()=>parseIntentInput({...data,workingChat:'x'.repeat(2401)}));
 assert.throws(()=>parsePlanInput({...input,workingChat:'[]'}));
 assert.throws(()=>parseCloudIntent({intent:'guided',resume:true},0));
 assert.deepEqual(parseCloudIntent({intent:'guided',resume:true},0,workingChat),{intent:'guided',resume:true});
 assert.throws(()=>parseCloudIntent({intent:'context_source',target:3},0,workingChat));
});
