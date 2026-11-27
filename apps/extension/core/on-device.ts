import {routeIntent} from './intent';

type ModelSession={prompt(text:string,options:{signal:AbortSignal}):Promise<string>;destroy():void};
type ModelAPI={
 availability():Promise<string>;
 create(options:{initialPrompts:{role:'system';content:string}[]}):Promise<ModelSession>;
};
type Recognition={
 processLocally:boolean;lang:string;continuous:boolean;interimResults:boolean;
 onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;
 onerror:((event:{error:string})=>void)|null;
 onend:(()=>void)|null;
 start():void;abort():void;
};
type SpeechOptions={langs:string[];processLocally:true};
type SpeechAPI={new():Recognition;available?(options:SpeechOptions):Promise<string>;install?(options:SpeechOptions):Promise<boolean>};
export type DictationStatus='available'|'downloadable'|'downloading'|'unsupported'|'blocked';
const speechOptions:SpeechOptions={langs:['en-US'],processLocally:true};
type Platform=typeof globalThis & {LanguageModel?:ModelAPI;SpeechRecognition?:SpeechAPI;webkitSpeechRecognition?:SpeechAPI};
const platform=globalThis as Platform;

export function validateSuggestion(output:string){
 const command=output.trim();
 if(command.length>300||/[\r\n\x00-\x1f]/.test(command))return null;
 const intent=routeIntent(command);
 return intent&&intent.type!=='type'?command:null;
}

export async function suggestOnDevice(command:string,signal:AbortSignal){
 const model=platform.LanguageModel;
 if(!model||await model.availability()!=='available')throw new Error('Chrome’s on-device model is not installed or available. Use one of the listed commands.');
 signal.throwIfAborted();
 const instance=await model.create({initialPrompts:[{role:'system',content:'Translate the request to exactly one supported command or return UNSUPPORTED. Supported commands: Open YouTube; Open YouTube in a new tab; Play SONG on YouTube; Search Google for QUERY; Inspect page; Scroll up; Scroll down; Page up; Page down; Go back; Next tab; Previous tab. Do not expand the scope or add actions. Output just the command, no prose.'}]});
 try{
  const result=validateSuggestion(await instance.prompt(command,{signal}));
  if(!result)throw new Error('No supported command was suggested.');
  return result;
 }finally{instance.destroy()}
}

function speechApi(){
 return [platform.SpeechRecognition,platform.webkitSpeechRecognition].find(api=>typeof api?.available==='function');
}

export async function checkLocalDictation():Promise<DictationStatus>{
 const Speech=speechApi();
 if(!Speech?.available)return 'unsupported';
 try{
  if(!('processLocally' in new Speech()))return 'unsupported';
  const status=await Speech.available(speechOptions);
  if(status==='available'||status==='downloading')return status;
  return status==='downloadable'&&typeof Speech.install==='function'?'downloadable':'unsupported';
 }catch{return 'blocked'}
}

export class DictationUnavailable extends Error{
 constructor(readonly status:Exclude<DictationStatus,'available'>){
  super({
   downloadable:'Download the English speech pack to use on-device dictation.',
   downloading:'Chrome is downloading the English speech pack. Check again when it finishes.',
   unsupported:'On-device English dictation isn’t supported in this Chrome. You can still type.',
   blocked:'Chrome didn’t let the extension check local speech support. You can still type.',
  }[status]);
 }
}

// Call directly from the download button's click; Chrome may require user activation.
export function installEnglishSpeechPack(){
 const Speech=speechApi();
 if(!Speech?.install)throw new DictationUnavailable('unsupported');
 return Speech.install(speechOptions);
}

export async function startLocalDictation(onText:(text:string)=>void,onEnd:(error?:string)=>void){
 const state=await checkLocalDictation();
 if(state!=='available')throw new DictationUnavailable(state);
 const Speech=speechApi();
 if(!Speech)throw new DictationUnavailable('unsupported');
 const recognizer=new Speech();
 recognizer.lang='en-US';recognizer.processLocally=true;recognizer.continuous=false;recognizer.interimResults=false;
 recognizer.onresult=e=>{const text=e.results[0]?.[0]?.transcript;if(text)onText(text.slice(0,1000))};
 recognizer.onerror=e=>onEnd(
  e.error==='not-allowed'?'Microphone access wasn’t allowed. Check Chrome’s microphone permission.':
  e.error==='audio-capture'?'Chrome couldn’t find a working microphone.':
  e.error==='no-speech'?'No speech was detected. Try again.':
  e.error==='aborted'?undefined:'On-device dictation stopped: '+e.error
 );
 recognizer.onend=()=>onEnd();
 recognizer.start();
 return ()=>recognizer.abort();
}
