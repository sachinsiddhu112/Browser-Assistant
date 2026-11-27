import {describe,expect,it} from 'vitest';
import {commandSites,resolveIntent} from './command-intent';
import {routeIntent} from './intent';

describe('command intent boundaries',()=>{
 it('routes the reported explicit URL without contacting a model',()=>{
  expect(routeIntent('open youtub in new tab using youtube.com')).toEqual({type:'open_youtube_tab'});
  expect(routeIntent("don't open youtub in new tab using youtube.com")).toBeNull();
  expect(routeIntent('open youtube in new tab using youtube.com.evil.test')).toBeNull();
  expect(routeIntent('open youtube in new tab using youtube.com then upload')).toBeNull();
 });
 it('maps a model classification to existing skills without treating model text as a command',()=>{
  for(const phrase of ['Could you pop YouTube into its own tab?','Keep this page and bring up YouTube beside it','Give YouTube a separate tab please']){
   expect(routeIntent(phrase)).toBeNull();
   expect(resolveIntent({intent:'youtube_tab'},phrase)).toEqual({type:'skill',command:'Open YouTube in a new tab'});
  }
  expect(resolveIntent({intent:'previous_tab'},'Take me to the tab on the left')).toEqual({type:'skill',command:'Previous tab'});
  expect(resolveIntent({intent:'guided'},'Is there a YouTube link here?')).toEqual({type:'guided'});
  expect(resolveIntent({intent:'youtube_here'},'What is this page?')).toMatchObject({type:'clarify'});
 });
 it('uses the same resolver for search, playback, research, and reviewed contact workflows',()=>{
  const cases=[
   ['google_search','Look up NestJS pipes for me on Google','NestJS pipes','Search Google for NestJS pipes'],
   ['youtube_play','Find and play Kesariya on YouTube','Kesariya','Play Kesariya on YouTube'],
   ['search_type','Put NestJS into the search box on this page','NestJS','Type NestJS into search'],
  ];
  for(const [intent,phrase,query,command] of cases){
   expect(routeIntent(phrase)).toBeNull();
   expect(resolveIntent({intent,args:[query]},phrase)).toEqual({type:'skill',command});
  }
  expect(resolveIntent({intent:'compare',args:['NestJS and Fastify validation']},'Could you look up the differences between NestJS and Fastify validation for me?'))
   .toMatchObject({type:'research',plan:{query:'NestJS and Fastify validation'}});
  expect(resolveIntent({intent:'compare',args:['[link] and [link]']},'What differs between https://docs.nestjs.com/pipes and https://fastify.dev/docs/latest?'))
   .toMatchObject({type:'research',plan:{direct:[{url:'https://docs.nestjs.com/pipes'},{url:'https://fastify.dev/docs/latest'}]}});
  expect(resolveIntent({intent:'profile'},'Put the contact info I saved into this form for review')).toEqual({type:'profile'});
  expect(resolveIntent({intent:'job',args:['Backend Engineer','Acme','Noida']},'Find where Acme takes applications for Backend Engineer in Noida'))
   .toMatchObject({type:'job',job:{role:'Backend Engineer',organization:'Acme',location:'Noida'}});
  expect(resolveIntent({intent:'youtube_play',args:['Invented song']},'Could you play Kesariya on YouTube?')).toMatchObject({type:'clarify'});
  expect(resolveIntent({intent:'job',args:['Backend Engineer','Acme','Delhi']},'Find where Acme takes applications for Backend Engineer in Noida')).toMatchObject({type:'clarify'});
 });
 it('only accepts a valid site index for literal user addresses, not arbitrary output, email, or private sites',()=>{
  const command='Please bring up docs.nestjs.com and keep this tab (not example.org).';
  const sites=commandSites(command);
  expect(sites.map(s=>s.url)).toEqual(['https://docs.nestjs.com/','https://example.org/']);
  expect(resolveIntent({intent:'open_site',target:0},command)).toMatchObject({type:'site',site:{url:'https://docs.nestjs.com/'}});
  expect(()=>resolveIntent({intent:'open_site',target:2},command)).toThrow();
  expect(()=>resolveIntent({intent:'open_site',target:0,url:'https://unexpected.example/'},command)).toThrow();
  expect(()=>resolveIntent({intent:'submit'},command)).toThrow();
  expect(commandSites('me@example.org https://localhost.local/path https://example.org/logout')).toEqual([]);
 });
});
