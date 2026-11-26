import {describe,expect,it,vi} from 'vitest';
import {askCloud,cloudPayload} from './cloud-client';
import {PLANNER_ORIGIN} from './cloud-config';
const view={text:['Call +91 98765 43210 or me@example.com.','Closing Friday.'],fields:['Secret label'],canScrollUp:false,canScrollDown:true};
const input=cloudPayload('Find the closing date.',view,[]);
describe('cloud planner request',()=>{
 it('never sends field labels and masks common PII patterns',()=>{
  expect(input.text.join(' ')).not.toMatch(/98765|example\.com/);
  expect(JSON.stringify(input)).not.toContain('Secret label');
 });
 it('shows distinct minute and daily limits without trusting arbitrary server text',async()=>{
  const signal=new AbortController().signal;
  const reject=(message:string)=>askCloud(input,signal,async()=>new Response(JSON.stringify({message}),{status:429}));
  await expect(reject('Per-IP limit reached (10 requests per minute)')).rejects.toThrow('10 cloud requests in a minute');
  await expect(reject('Public planner daily limit reached')).rejects.toThrow('used up for today');
  await expect(reject('untrusted error text')).rejects.toThrow('Cloud planner is busy');
 });
 it('rejects redirects at the fetch layer and a provider draft in the client',async()=>{
  const send=vi.fn(async()=>new Response(JSON.stringify({decision:{type:'draft',entries:[{field:0,value:'X'}]}})));
  await expect(askCloud(input,new AbortController().signal,send)).rejects.toThrow('cannot draft');
  expect(send).toHaveBeenCalledWith(PLANNER_ORIGIN+'/planner/next',expect.objectContaining({redirect:'error',credentials:'omit',headers:{'Content-Type':'application/json'}}));
 });
});
