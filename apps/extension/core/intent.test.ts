import {describe,it,expect} from 'vitest';
import {routeIntent,allowedNavigation} from './intent';
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
 it('encodes search text',()=>expect(routeIntent('Search Google for a&b')).toEqual({type:'navigate',url:'https://www.google.com/search?q=a%26b'}));
 it('rejects unsupported commands',()=>expect(routeIntent('delete account')).toBeNull());
 it('restricts navigation',()=>{expect(allowedNavigation('https://www.youtube.com/')).toBe(true);expect(allowedNavigation('https://www.youtube.com.evil.test/')).toBe(false);expect(allowedNavigation('javascript:alert(1)')).toBe(false)});
});
