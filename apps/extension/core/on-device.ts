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
type SpeechAPI={new():Recognition;available(options:{langs:string[];processLocally:true}):Promise<string>};
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
 const instance=await model.create({initialPrompts:[{role:'system',content:'Translate the request to exactly one supported command or return UNSUPPORTED. Supported commands: Open YouTube; Play SONG on YouTube; Search Google for QUERY; Inspect page; Scroll up; Scroll down; Page up; Page down; Go back; Next tab; Previous tab. Do not expand the scope or add actions. Output just the command, no prose.'}]});
 try{
  const result=validateSuggestion(await instance.prompt(command,{signal}));
  if(!result)throw new Error('No supported command was suggested.');
  return result;
 }finally{instance.destroy()}
}

export async function startLocalDictation(onText:(text:string)=>void,onEnd:(error?:string)=>void){
 const Speech=platform.SpeechRecognition??platform.webkitSpeechRecognition;
 const lang='en-US';
 if(!Speech?.available||await Speech.available({langs:[lang],processLocally:true})!=='available'){
  throw new Error('On-device English dictation is not available in this Chrome. You can still type.');
 }
 const recognizer=new Speech();
 if(!('processLocally' in recognizer))throw new Error('Local speech processing is not supported.');
 recognizer.lang=lang;recognizer.processLocally=true;recognizer.continuous=false;recognizer.interimResults=false;
 recognizer.onresult=e=>{const text=e.results[0]?.[0]?.transcript;if(text)onText(text.slice(0,1000))};
 recognizer.onerror=e=>onEnd(e.error==='not-allowed'?'Microphone access wasn’t allowed.':'Dictation stopped: '+e.error);
 recognizer.onend=()=>onEnd();
 recognizer.start();
 return ()=>recognizer.abort();
}
