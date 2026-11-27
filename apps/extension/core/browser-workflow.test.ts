import {describe,it,expect} from 'vitest';
import {parseSiteIntent} from './site-intent';
import {parseFormIntent} from './form-intent';
import {parseGuidedDecision} from './guided-contract';
import {cloudPayload} from './cloud-client';

describe('explicit user destinations',()=>{
 it('opens HTTPS and separates the remaining instruction',()=>{
  expect(parseSiteIntent('Open docs.nestjs.com in a new tab, then find the Guards guide')).toEqual({
   url:'https://docs.nestjs.com/',origin:'https://docs.nestjs.com',goal:'find the Guards guide',
  });
 });
 it.each(['Open javascript:alert(1)','Open http://example.com','Open https://trusted.com@other.com','Open https://example.com:8080','Open https://example.com/logout','Open https://x.local','Open 127.0.0.1','Open https://example.com/?q=one'])('refuses %s',command=>{
  expect(parseSiteIntent(command)).toBeNull();
 });
});
describe('review contracts',()=>{
 it('prepares explicit form values without a model',()=>{
  expect(parseFormIntent('Fill "Full name" with "Sachin"; "Message" with "Hello"')).toEqual([{label:'Full name',value:'Sachin'},{label:'Message',value:'Hello'}]);
  expect(parseFormIntent('Fill "Full name" with "Sachin" and submit')).toBeNull();
  expect(parseFormIntent('Fill "Name" with "S"; "name" with "P"')).toBeNull();
 });
 it('allows only an index for native disclosure and never sends its label or fields to the cloud',()=>{
  expect(parseGuidedDecision('{"type":"expand","disclosure":0}')).toEqual({type:'expand',disclosure:0});
  expect(()=>parseGuidedDecision('{"type":"expand","disclosure":0,"selector":"button"}')).toThrow();
  expect(cloudPayload('Read this page',{text:[],fields:['Private field'],disclosures:['Local disclosure'],canScrollUp:false,canScrollDown:false},[]))
   .toEqual({goal:'Read this page',text:[],canScrollUp:false,canScrollDown:false,previousDirections:[]});
 });
});
