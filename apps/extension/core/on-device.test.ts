import {describe,it,expect} from 'vitest';
import {validateSuggestion} from './on-device';
describe('untrusted on-device proposals',()=>{
 it('accepts a single supported local command for user review',()=>expect(validateSuggestion(' Open YouTube ')).toBe('Open YouTube'));
 it('denies unsupported, batched, scripted and generic data-entry commands',()=>{
  for(const text of ['UNSUPPORTED','Scroll down\nOpen YouTube','fetch("https://example.com")','Type foo into search','Click submit','Go to https://example.com']){
   expect(validateSuggestion(text)).toBeNull();
  }
 });
});
