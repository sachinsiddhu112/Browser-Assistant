import {describe,expect,it,vi} from 'vitest';
import {askCloud,cloudEndpoint,cloudPayload} from './cloud-client';
const view={text:['Call +91 98765 43210 or me@example.com.','Closing Friday.'],fields:['Secret label'],canScrollUp:false,canScrollDown:true};
const input=cloudPayload('Find the closing date.',view,[]);
describe('cloud planner request',()=>{
 it('allows only a plain HTTPS origin or explicit localhost',()=>{
  expect(cloudEndpoint('https://planner.example.com')).toEqual({endpoint:'https://planner.example.com/planner/next',host:'https://planner.example.com/*'});
  for(const v of ['http://example.com','https://user:pass@host.test','https://host.test/path','file:///tmp/test','https://www.youtube.com'])expect(()=>cloudEndpoint(v)).toThrow();
 });
 it('never sends field labels and masks common PII patterns',()=>{
  expect(input.text.join(' ')).not.toMatch(/98765|example\.com/);
  expect(JSON.stringify(input)).not.toContain('Secret label');
 });
 it('rejects redirects at the fetch layer and a provider draft in the client',async()=>{
  const send=vi.fn(async()=>new Response(JSON.stringify({decision:{type:'draft',entries:[{field:0,value:'X'}]}})));
  await expect(askCloud('https://planner.example.com/planner/next','token',input,new AbortController().signal,send)).rejects.toThrow('cannot draft');
  expect(send).toHaveBeenCalledWith('https://planner.example.com/planner/next',expect.objectContaining({redirect:'error',credentials:'omit'}));
 });
});
