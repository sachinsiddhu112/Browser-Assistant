import {describe,it,expect} from 'vitest';
import {routeIntent,allowedNavigation} from './intent';
import {Action} from '@browser-assistant/shared';
describe('navigation skills',()=>{
 it('routes history and tab commands',()=>{expect(Action.parse(routeIntent('Go back'))).toEqual({type:'go_back'});expect(Action.parse(routeIntent('Next tab'))).toEqual({type:'switch_tab',direction:'next'})});
 it('encodes song queries',()=>{const a=routeIntent('Play A & B on YouTube');expect(a).toEqual({type:'navigate',url:'https://www.youtube.com/results?search_query=A%20%26%20B'});if(a?.type==='navigate')expect(allowedNavigation(a.url)).toBe(true)});
 it('rejects untrusted watch destinations',()=>{expect(allowedNavigation('https://www.youtube.com.evil.test/watch?v=abcdefghijk')).toBe(false);expect(allowedNavigation('https://www.youtube.com/watch?v=bad')).toBe(false)});
});
