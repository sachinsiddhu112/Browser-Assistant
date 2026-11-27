import {describe,expect,it} from 'vitest';
import {parseResearch,publicResearchUrl,researchSnapshot,validateResearchSources} from './research';
describe('bounded research',()=>{
 it('accepts explicit URLs or a search topic without changing ordinary commands',()=>{
  expect(parseResearch('Scroll down')).toBeNull();
  expect(parseResearch('Research NestJS validation')?.query).toBe('NestJS validation');
  expect(parseResearch('Compare https://docs.nestjs.com/techniques/validation and https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/')?.direct).toHaveLength(2);
  expect(()=>parseResearch('Compare https://example.com/a')).toThrow();
 });
 it.each(['javascript:alert(1)','http://example.com/','https://a@sample.com/','https://example.com/a?token=xyz','https://0.0.0.0/','https://host.local/','https://example.com/%6Cogin','https://example.com/test.zip'])('rejects risky destination %s',url=>expect(publicResearchUrl(url)).toBeNull());
 it('keeps only distinct validated slots and marks each bounded excerpt with its source number',()=>{
  expect(validateResearchSources([{title:'A',url:'https://example.com/guide'},{title:'Duplicate',url:'https://example.com/guide'},{title:'Invalid',url:'file:///etc'}])).toHaveLength(1);
  expect(researchSnapshot([{text:Array(6).fill('One')},{text:Array(6).fill('Two')},{text:Array(6).fill('Three')}]).text).toHaveLength(12);
  expect(researchSnapshot([{text:['First']},{text:['Next']}]).text).toEqual(['Source 1: First','Source 2: Next']);
 });
});
