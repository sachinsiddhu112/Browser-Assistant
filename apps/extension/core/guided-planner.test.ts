import {describe,expect,it,vi} from 'vitest';
import {MAX_GUIDED_STEPS,labelDraft,parseGuidedDecision,type GuidedSnapshot} from './guided-contract';
import {runGuided,type GuidedTransport} from './guided-planner';

const top:GuidedSnapshot={text:['Overview'],fields:[],canScrollUp:false,canScrollDown:true};
const lower:GuidedSnapshot={text:['Applications close on Friday.'],fields:['Full name'],canScrollUp:true,canScrollDown:false};
function fixture(){
 return {
  begin:vi.fn(async()=>({sessionId:'test',snapshot:top})),
  step:vi.fn<GuidedTransport['step']>(async(_id,decision)=>decision.type==='scroll'?lower:undefined),
  fail:vi.fn(async()=>{}),
 };
}
const scroll='{"type":"scroll","direction":"down"}';

describe('guided planner',()=>{
 it('makes the next decision from the fresh viewport, not a fixed site workflow',async()=>{
  const io=fixture();
  const model=vi.fn<Parameters<typeof runGuided>[1]>(async ({snapshot})=>snapshot===top?scroll:'{"type":"finish","answer":"Friday"}');
  await runGuided(io,model,new AbortController().signal);
  expect(model.mock.calls[1][0].snapshot).toBe(lower);
  expect(io.step.mock.calls.map(c=>c[1].type)).toEqual(['scroll','finish']);
 });
 it('rejects steps outside its capabilities before dispatch',async()=>{
  const io=fixture();
  await expect(runGuided(io,async()=>'{"type":"click","selector":"#submit"}',new AbortController().signal)).rejects.toThrow('supported step');
  expect(io.step).not.toHaveBeenCalled();
  expect(io.fail).toHaveBeenCalledOnce();
 });
 it('does not dispatch after cancellation during inference',async()=>{
  const io=fixture(), cancel=new AbortController();
  await expect(runGuided(io,async()=>{cancel.abort();return scroll},cancel.signal)).rejects.toThrow();
  expect(io.step).not.toHaveBeenCalled();
 });
 it('stops asking the model at the step limit',async()=>{
  const io=fixture();
  await expect(runGuided(io,async()=>scroll,new AbortController().signal)).rejects.toThrow('step limit');
  expect(io.step).toHaveBeenCalledTimes(MAX_GUIDED_STEPS);
 });
 it('validates each form draft against the observed field indices',()=>{
  expect(labelDraft(lower.fields,[{field:0,value:'Sachin'}])).toEqual([{label:'Full name',value:'Sachin'}]);
  expect(()=>labelDraft(lower.fields,[{field:1,value:'Sachin'}])).toThrow('did not match');
  expect(()=>parseGuidedDecision('{"type":"draft","entries":[],"submit":true}')).toThrow();
 });
});
