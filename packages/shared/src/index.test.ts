import {describe,it,expect} from 'vitest';
import {Action} from './index';
describe('action contract',()=>{
 it('rejects arbitrary actions',()=>expect(Action.safeParse({type:'eval',code:'alert(1)'}).success).toBe(false));
 it('rejects implicit submission',()=>expect(Action.safeParse({type:'type',elementId:1,snapshotId:'a',text:'hello',submit:true}).success).toBe(false));
 it('requires snapshot identity',()=>expect(Action.safeParse({type:'click',elementId:1}).success).toBe(false));
});
