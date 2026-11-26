import {parseGuidedDecision,type GuidedDecision,type GuidedSnapshot} from './guided-contract';
export function cloudEndpoint(origin:string){
 const v=new URL(origin.trim());
 if(v.username||v.password||v.pathname!=='/'||v.search||v.hash)throw new Error('Enter only the planner origin, with no path.');
 if(v.protocol!=='https:'&&!(v.protocol==='http:'&&v.hostname==='localhost'))throw new Error('Use HTTPS, or http://localhost for a local test.');
 const allowed=new Set(['localhost','www.google.com','www.youtube.com']);
 if(v.protocol==='https:'&&allowed.has(v.hostname))throw new Error('Enter a dedicated planner host, not a browser skill site.');
 return {endpoint:v.origin+'/planner/next',host:v.protocol+'//'+v.hostname+'/*'};
}
export function maskCloudText(value:string){
 return value
  .replace(/https?:\/\/\S+/gi,'[link]')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]')
  .replace(/(?:\+?\d[\d\s.-]{6,}\d)/g,'[number]')
  .replace(/\b(?:sk-[\w-]+|[\w-]{24,})\b/g,'[identifier]')
  .replace(/\b(?:password|token|secret|api\s*key|otp|pin)\s*[:=]\s*\S+/gi,'[redacted]');
}
export function cloudPayload(goal:string,snapshot:GuidedSnapshot,previous:GuidedDecision[]){
 return {goal:maskCloudText(goal),text:snapshot.text.slice(0,12).map(x=>maskCloudText(x).slice(0,160)),
  canScrollUp:snapshot.canScrollUp,canScrollDown:snapshot.canScrollDown,
  previousDirections:previous.flatMap(e=>e.type==='scroll'?[e.direction]:[])};
}
export async function askCloud(endpoint:string,token:string,input:ReturnType<typeof cloudPayload>,signal:AbortSignal,send:typeof fetch=fetch){
 const response=await send(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',body:JSON.stringify(input),signal});
 if(!response.ok){
  if(response.status===401)throw new Error('Check the private planner access token.');
  if(response.status===429)throw new Error('Cloud planner limit reached. Try again shortly.');
  if(response.status===503)throw new Error('The cloud planner is not configured on that server.');
  throw new Error('Cloud planner could not complete a step.');
 }
 const body=await response.json() as {decision?:unknown};
 const raw=JSON.stringify(body.decision)??'';
 const decision=parseGuidedDecision(raw);
 if(decision.type==='draft')throw new Error('Cloud mode cannot draft or fill form fields.');
 return raw;
}
