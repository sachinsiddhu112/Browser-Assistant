import {afterEach,describe,expect,it,vi} from 'vitest';
import {checkGuidedModel} from './guided-model';

describe('Chrome AI readiness check',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it.each(['available','downloadable','downloading','unavailable'] as const)('reports %s without creating a model',async state=>{
  const create=vi.fn();
  vi.stubGlobal('LanguageModel',{availability:async()=>state,create});
  expect(await checkGuidedModel()).toBe(state);
  expect(create).not.toHaveBeenCalled();
 });
 it('handles missing or failed API without preventing built-in skills',async()=>{
  vi.stubGlobal('LanguageModel',undefined);
  expect(await checkGuidedModel()).toBe('unavailable');
  vi.stubGlobal('LanguageModel',{availability:async()=>{throw new Error('Unavailable')}});
  expect(await checkGuidedModel()).toBe('unavailable');
 });
});
