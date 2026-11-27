import {z} from 'zod';
import {maskCloudText} from './cloud-client';
import {publicResearchUrl} from './research';
import {parseSiteIntent} from './site-intent';

export const taskKey=(windowId:number)=>'assistant.session.'+windowId;
export const chatKey=(windowId:number)=>'assistant.chat.'+windowId;
const MAX_TURNS=8;
const short=z.string().trim().min(1).max(600);
const Source=z.object({title:z.string().max(110),url:z.string().url().max(450)}).strict();
export const ChatNote=z.object({
 result:short,kind:z.enum(['result','question','status']),page:z.object({tabId:z.number().int().nonnegative(),url:z.string().url().max(1500),documentId:z.string().min(1).max(100),completedSteps:z.number().int().min(0).max(5).optional()}).strict().optional(),sources:z.array(Source).max(3).optional()
}).strict();
export type ChatNote=z.infer<typeof ChatNote>;
const Turn=z.object({id:z.string().uuid(),input:short,resumes:z.string().uuid().optional(),note:ChatNote.optional()}).strict();
export const WorkingChat=z.object({id:z.string().uuid(),turns:z.array(Turn).max(MAX_TURNS)}).strict();
export type WorkingChat=z.infer<typeof WorkingChat>;

export function contextText(text:string){
 // Keep form values and credential-like requests out of working context.
 if(/\b(?:password|secret|otp|api\s*key|access\s*token|private\s*key)\b|^\s*(?:please\s+)?fill\s*"/i.test(text))
  return '[sensitive text omitted]';
 return maskCloudText(text).replace(/\s+/g,' ').trim().slice(0,600)||'[text omitted]';
}
export function freshChat():WorkingChat{return {id:crypto.randomUUID(),turns:[]}}
export function beginChatTurn(chat:WorkingChat,input:string){
 const previous=chat.turns.at(-1);
 const turn={id:crypto.randomUUID(),input:contextText(input)};
 return {turn,previous,past:chat,chat:{...chat,turns:[...chat.turns,turn].slice(-MAX_TURNS)}};
}
export function addChatNote(chat:WorkingChat,turnId:string,note:ChatNote,resumes?:string):WorkingChat{
 if(chat.turns.at(-1)?.id!==turnId)return chat;
 const sources=note.sources?.flatMap(s=>{
  const url=publicResearchUrl(s.url);
  return url&&parseSiteIntent('Open '+url)?[{url,title:contextText(s.title).slice(0,110)}]:[];
 });
 return {...chat,turns:chat.turns.map(t=>t.id===turnId?{...t,...(resumes?{resumes}:{}),
  note:{result:contextText(note.result),kind:note.kind,...(note.page&&note.kind==='question'?{page:note.page}:{}),...(sources?.length?{sources}:{})}}:t)};
}
export function chatSources(chat:WorkingChat){
 return chat.turns.findLast(t=>t.note?.sources?.length)?.note?.sources??[];
}
export function pendingQuestion(chat:WorkingChat){
 const answered=new Set(chat.turns.filter(t=>t.note?.kind==='result'&&t.resumes).map(t=>t.resumes));
 const latest=chat.turns.findLast(t=>t.note?.kind==='question'&&!answered.has(t.resumes??t.id));
 if(!latest?.note)return undefined;
 const prior=latest.resumes?chat.turns.find(t=>t.id===latest.resumes):undefined;
 return {id:latest.resumes??latest.id,request:prior?.input??latest.input,question:latest.note.result,page:latest.note.page};
}
export function modelContext(chat:WorkingChat,answer?:string){
 const pending=pendingQuestion(chat);
 const sources=chatSources(chat).map(s=>s.title.slice(0,80));
 const turns=chat.turns.slice(-5).map(t=>({
  request:t.input.slice(0,230),...(t.note?{kind:t.note.kind,output:t.note.result.slice(0,230)}:{})
 }));
 // Keep a valid JSON object even when context must be trimmed. No raw page, URLs or saved profile.
 for(let start=0;start<=turns.length;start++){
  const encoded=JSON.stringify({recent:turns.slice(start),...(pending?{pending:{request:pending.request.slice(0,350),question:pending.question.slice(0,220),...(pending.page?.completedSteps?{completedSteps:pending.page.completedSteps}:{}),...(answer?{answer:contextText(answer).slice(0,300)}:{})}}:{}),
   ...(sources.length?{sources}: {})});
  if(encoded.length<=2400)return encoded;
 }
 return '';
}
