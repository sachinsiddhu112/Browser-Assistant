import {describe,it,expect} from 'vitest';
import {routeIntent,allowedNavigation,normalizePlatform} from './intent';
describe('local intent router',()=>{
 it('routes supported commands',()=>{expect(routeIntent('Scroll down')).toEqual({type:'scroll',direction:'down'});expect(routeIntent('Open YouTube')).toEqual({type:'navigate',url:'https://www.youtube.com/'})});
 it('only opens a new tab for an explicit YouTube command',()=>{
  for(const command of ['Open a new tab for YouTube','Open YouTube in a new tab','Please open a new tab to YouTube.com.']){
   expect(routeIntent(command)).toEqual({type:'open_youtube_tab'});
  }
  for(const command of ['Do not open a new tab for YouTube','open a new tab for youtube.evil.test','Open YouTube in a new tab and submit','Open a new tab','Open another website']){
   expect(routeIntent(command)).toBeNull();
  }
 });
 it('routes an explicit playback request with a typo in the service name',()=>{
  const phrases=['play some Casa Tupka song by honey singh on youtbue,','Please play me Casa Tupka on youtub.','Play Casa Tupka on youttube!'];
  for(const phrase of phrases){
   const action=routeIntent(phrase);
   expect(action?.type).toBe('navigate');
   expect(new URL((action as {url:string}).url).searchParams.get('search_query')).toMatch(/Casa Tupka/);
  }
  expect(normalizePlatform('Could you put some Casa Tupka on youtbue?')).toBe('Could you put some Casa Tupka on youtube?');
  expect(routeIntent('Do not play Casa Tupka on youtbue')).toBeNull();
  expect(routeIntent('Play Casa Tupka on youtbue.example.org')).toBeNull();
  expect(routeIntent('Play Casa Tupka on Spotify')).toBeNull();
 });
 it('encodes search text',()=>expect(routeIntent('Search Google for a&b')).toEqual({type:'navigate',url:'https://www.google.com/search?q=a%26b'}));
 it('rejects unsupported commands',()=>expect(routeIntent('delete account')).toBeNull());
 it('restricts navigation',()=>{expect(allowedNavigation('https://www.youtube.com/')).toBe(true);expect(allowedNavigation('https://www.youtube.com.evil.test/')).toBe(false);expect(allowedNavigation('javascript:alert(1)')).toBe(false)});
});
