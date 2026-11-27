import {describe,it,expect,vi,afterEach} from 'vitest';
import {validateSuggestion, checkLocalDictation, installEnglishSpeechPack, startLocalDictation} from './on-device';
describe('untrusted on-device proposals',()=>{
 it('accepts a single supported local command for user review',()=>expect(validateSuggestion(' Open YouTube ')).toBe('Open YouTube'));
 it('denies unsupported, batched, scripted and generic data-entry commands',()=>{
  for(const text of ['UNSUPPORTED','Scroll down\nOpen YouTube','fetch("https://example.com")','Type foo into search','Click submit','Go to https://example.com']){
   expect(validateSuggestion(text)).toBeNull();
  }
 });
});

describe('local microphone setup',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it('distinguishes downloadable, downloading, unavailable and blocked support',async()=>{
  const available=vi.fn();
  class Speech{processLocally=false;static available=available; static install=vi.fn()}
  vi.stubGlobal('SpeechRecognition',Speech);
  available.mockResolvedValue('downloadable');
  expect(await checkLocalDictation()).toBe('downloadable');
  expect(available).toHaveBeenCalledWith({langs:['en-US'],processLocally:true});
  await expect(startLocalDictation(vi.fn(),vi.fn())).rejects.toMatchObject({status:'downloadable'});
  available.mockResolvedValue('downloading');
  expect(await checkLocalDictation()).toBe('downloading');
  available.mockResolvedValue('unavailable');
  expect(await checkLocalDictation()).toBe('unsupported');
  available.mockRejectedValue(new DOMException('Disallowed','NotAllowedError'));
  expect(await checkLocalDictation()).toBe('blocked');
 });
 it('requires a separate install click and sets processLocally before activating the mic',async()=>{
  const available=vi.fn().mockResolvedValue('downloadable'),install=vi.fn().mockResolvedValue(true), onEnd=vi.fn();
  const started=vi.fn();
  class Speech{
   static available=available;static install=install;
   processLocally=false;
   onerror:(value:{error:string})=>void=()=>{};
   start(){started(this.processLocally);this.onerror({error:'not-allowed'})}
   abort(){}
  }
  vi.stubGlobal('SpeechRecognition',Speech);
  expect(await installEnglishSpeechPack()).toBe(true);
  expect(install).toHaveBeenCalledWith({langs:['en-US'],processLocally:true});
  expect(started).not.toHaveBeenCalled();
  available.mockResolvedValue('available');
  await startLocalDictation(vi.fn(),onEnd);
  expect(started).toHaveBeenCalledExactlyOnceWith(true);
  expect(onEnd).toHaveBeenCalledWith(expect.stringContaining('Microphone access wasn’t allowed'));
 });
});
