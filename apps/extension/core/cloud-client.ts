import {parseGuidedDecision,type GuidedDecision,type GuidedSnapshot} from './guided-contract';
import {PLANNER_ORIGIN} from './cloud-config';
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
  ...(snapshot.links?.length?{links:snapshot.links.map(x=>maskCloudText(x).slice(0,160))}:{}),
  canScrollUp:snapshot.canScrollUp,canScrollDown:snapshot.canScrollDown,
  previousDirections:previous.flatMap(e=>e.type==='scroll'?[e.direction]:[])};
}
export async function askCloud(input:ReturnType<typeof cloudPayload>,signal:AbortSignal,send:typeof fetch=fetch){
 const response=await send(PLANNER_ORIGIN+'/planner/next',{method:'POST',headers:{'Content-Type':'application/json'},
  cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',body:JSON.stringify(input),signal});
 if(!response.ok){
  if(response.status===401)throw new Error('This deployment has not enabled public cloud access yet.');
  if(response.status===429){
   const error=await response.json().catch(()=>null) as {message?:unknown}|null;
   if(error?.message==='Per-IP limit reached (10 requests per minute)')throw new Error('This network reached 10 cloud requests in a minute. Try again shortly.');
   if(error?.message==='Public planner daily limit reached')throw new Error('The shared cloud limit is used up for today. Local commands still work.');
   throw new Error('Cloud planner is busy. Try again shortly; local commands still work.');
  }
  if(response.status===503)throw new Error('Public cloud is currently offline. Local commands still work.');
  throw new Error('Cloud planner could not complete a step.');
 }
 const body=await response.json() as {decision?:unknown};
 const raw=JSON.stringify(body.decision)??'';
 const decision=parseGuidedDecision(raw);
 if(decision.type==='draft'||decision.type==='expand')throw new Error('Cloud mode cannot draft or fill form fields.');
 return raw;
}

// A separate mode on the same budgeted endpoint; no page text or raw URLs.
export async function askCloudIntent(goal:string,sites:{origin:string}[],signal:AbortSignal,send:typeof fetch=fetch){
 const response=await send(PLANNER_ORIGIN+'/planner/next',{method:'POST',headers:{'Content-Type':'application/json'},
  cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',
  body:JSON.stringify({mode:'intent',goal:maskCloudText(goal),sites:sites.map(site=>new URL(site.origin).hostname)}),signal});
 if(response.status===400)return undefined; // Older deployments can still answer page questions.
 if(!response.ok)throw new Error(response.status===429?'The cloud request limit was reached. Try again shortly.':'Cloud command routing could not respond.');
 return (await response.json() as {decision?:unknown}).decision;
}
