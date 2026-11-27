import {createEngine} from '../core/dom-engine';
export default defineUnlistedScript(()=>{
 const scope=globalThis as typeof globalThis & {__assistantExecutorInstalled?:boolean};
 if(scope.__assistantExecutorInstalled)return;
 scope.__assistantExecutorInstalled=true;
 const engine=createEngine();
 browser.runtime.onMessage.addListener((raw,sender,respond)=>{
  if(sender.id!==browser.runtime.id||sender.tab)return false;
  if(raw?.type!=='OBSERVE_PAGE'&&raw?.type!=='EXECUTE_ACTION')return false;
  void Promise.resolve().then(async()=>raw.type==='OBSERVE_PAGE'?engine.observe():await engine.execute(raw.action))
   .then(result=>respond({ok:true,result}),e=>respond({ok:false,error:e instanceof Error?e.message:'Execution failed'}));
  return true;
 });
});
