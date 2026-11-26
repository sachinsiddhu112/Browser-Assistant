import {createEngine} from '../core/dom-engine';
export default defineUnlistedScript(()=>{
 const scope=globalThis as typeof globalThis & {__assistantExecutorInstalled?:boolean};
 if(scope.__assistantExecutorInstalled)return;
 scope.__assistantExecutorInstalled=true;
 const engine=createEngine();
 browser.runtime.onMessage.addListener((raw,sender,respond)=>{
  if(sender.id!==browser.runtime.id||sender.tab)return false;
  if(raw?.type!=='OBSERVE_PAGE'&&raw?.type!=='EXECUTE_ACTION')return false;
  try{respond({ok:true,result:raw.type==='OBSERVE_PAGE'?engine.observe():engine.execute(raw.action)})}catch(e){respond({ok:false,error:e instanceof Error?e.message:'Execution failed'})}
  return false;
 });
});
