import {describe,it,expect} from 'vitest';
import {Action} from '@browser-assistant/shared';
import {routeIntent} from './intent';
describe('restricted observation and keyboard routing',()=>{
 it('routes inspection and page scrolling',()=>{expect(Action.parse(routeIntent('Inspect page'))).toEqual({type:'observe'});expect(Action.parse(routeIntent('Page down'))).toEqual({type:'press_key',key:'PageDown'})});
 it('rejects submission and arbitrary key combinations',()=>{expect(Action.safeParse({type:'press_key',key:'Enter'}).success).toBe(false);expect(Action.safeParse({type:'press_key',key:'Ctrl+L'}).success).toBe(false)});
});
