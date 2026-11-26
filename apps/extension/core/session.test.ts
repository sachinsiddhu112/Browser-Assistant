import {describe,it,expect} from 'vitest';
import {Request,cancel,mockPlan,terminal,type Session} from './session';
const s:Session={id:'1',tabId:1,command:'hello',phase:'thinking',message:''};
describe('mock lifecycle',()=>{
 it('cancels active tasks',()=>expect(cancel(s).phase).toBe('cancelled'));
 it('preserves completed tasks',()=>expect(cancel({...s,phase:'success'}).phase).toBe('success'));
 it('marks cancelled terminal',()=>expect(terminal(cancel(s))).toBe(true));
 it('rejects empty commands',()=>expect(Request.safeParse({type:'START',command:' '}).success).toBe(false));
 it('requires a page binding for cloud planning',()=>{
  expect(Request.safeParse({type:'START_CLOUD',mode:'cloud'}).success).toBe(false);
  expect(Request.safeParse({type:'START_CLOUD',mode:'cloud',expectedTab:{id:1,url:'https://example.com'}}).success).toBe(true);
  expect(Request.safeParse({type:'START_GUIDED',mode:'cloud'}).success).toBe(false);
 });
 it('never emits a browser action',()=>expect(mockPlan('click').type).toBe('done'));
});
