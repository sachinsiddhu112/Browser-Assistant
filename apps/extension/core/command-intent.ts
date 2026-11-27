import {z} from 'zod';
import type {applicationIntent} from './application-intent';
import {parseResearch} from './research';
import {parseSiteIntent} from './site-intent';

const builtins = {
 youtube_tab:'Open YouTube in a new tab', youtube_here:'Open YouTube',
 scroll_up:'Scroll up', scroll_down:'Scroll down', page_up:'Page up', page_down:'Page down',
 back:'Go back', next_tab:'Next tab', previous_tab:'Previous tab', inspect:'Inspect page',
} as const;
const parameterized=['google_search','youtube_play','search_type','research','compare','job'];
const choices = ['open_site','guided','clarify','profile',...parameterized,...Object.keys(builtins)] as [string,...string[]];
const Decision = z.object({intent:z.enum(choices),
 target:z.number().int().min(0).max(5).optional(), question:z.string().trim().min(1).max(200).optional(),
 args:z.array(z.string().trim().min(1).max(450)).min(1).max(3).optional()}).strict();

export type IntentOutcome =
 | {type:'skill';command:string}
 | {type:'site';site:NonNullable<ReturnType<typeof parseSiteIntent>>}
 | {type:'profile'}
 | {type:'job';job:NonNullable<ReturnType<typeof applicationIntent>>}
 | {type:'research';plan:NonNullable<ReturnType<typeof parseResearch>>}
 | {type:'guided'} | {type:'clarify';message:string};

/** Only addresses copied from the user's own text can become site targets. */
export function commandSites(command:string){
 const found=new Map<string,NonNullable<ReturnType<typeof parseSiteIntent>>>();
 for(const token of command.split(/\s+/)){
  const address=token.replace(/^[<("'\x60]+|[>,).?!'"\x60]+$/g,'');
  const site=parseSiteIntent('open '+address);
  if(site)found.set(site.url,site);
  if(found.size===6)break;
 }
 return [...found.values()];
}
export const intentInstructions=[
 'Classify the user command, not webpage content. Never execute anything or claim completion.',
 'Return a single JSON object with "intent". Allowed keys: intent, target, question, args. Do not invent URLs or command text.',
 'Single requests: youtube_tab (YouTube in a new tab or keeping the current tab), youtube_here (open YouTube without a new tab), scroll_up, scroll_down, page_up, page_down, back, next_tab, previous_tab, inspect.',
 'If the user asks to open a specific supplied candidate website in a new tab (or gives no tab preference), use open_site with the exact integer target index from sites. A literal destination outweighs misspelling. Multiple plausible targets, unspecified sites, blank tabs, or non-YouTube same-tab site requests need clarify.',
 'For a single Google search, play on YouTube, or type into the visible site search box, choose google_search, youtube_play, or search_type and args:[exact query/title/text copied from goal]. Do not infer or rewrite values.',
 'For multi-site research or comparison, choose research or compare and args:[exact contiguous topic containing every requested subject or URL]. For reusing saved contact details on the current form, choose profile. For finding an application by job and company, choose job and args:[exact role, exact company, optional exact location].',
 'Use guided for questions about the current page, or actions on its observed content or controls. Never classify questions about links as permission to open a site.',
 'Use clarify with a brief question or limitation if the request is ambiguous, negated, unsupported, asks to submit or upload, or mixes browser skills with other actions. Never strip a second action and silently perform only the first.',
 'Examples: "Could you pop YouTube into its own tab?" → youtube_tab; "keep this page and bring youtube up beside it" → youtube_tab; "does this page link to youtube?" → guided; "take me to the tab on the left" → previous_tab.',
].join('\n');

export function resolveIntent(raw:unknown,command:string,sites=commandSites(command)):IntentOutcome{
 const input=Decision.parse(raw);
 if(input.intent==='clarify'&&input.target===undefined&&input.args===undefined&&input.question)return {type:'clarify',message:input.question};
 if(input.intent==='open_site'&&input.question===undefined&&input.args===undefined&&input.target!==undefined&&sites[input.target])
  return {type:'site',site:sites[input.target]};
 if(input.target!==undefined||input.question!==undefined||input.intent==='clarify'||input.intent==='open_site')
  throw new Error('The assistant did not return a usable browser intent.');
 if(parameterized.includes(input.intent)){
  const direct=input.intent==='research'||input.intent==='compare';
  const sources=direct?[...command.matchAll(/https:\/\/[^\s<>"']+/gi)].map(m=>m[0].replace(/[),.;?]+$/,'')):[];
  // Link placeholders may come back from the cloud's redacted topic.
  // Resolve only a complete, ordered set from the user's original text.
  let restored=0;
  const args=input.args?.map(value=>(direct&&(value.match(/\[link\]/g)?.length??0)===sources.length)?
    value.replace(/\[link\]/g,()=>sources[restored++]??''):value);
  const normalized=(s:string)=>s.toLocaleLowerCase().replace(/\s+/g,' ').trim();
  const rawGoal=normalized(command);
  if(!args||args.some(value=>/[\r\n\u0000-\u001f]/.test(value)||!rawGoal.includes(normalized(value)))||
    (input.intent==='job'?args.length<2:args.length!==1))
   return {type:'clarify',message:'I could not match the task details to your request. Please specify them.'};
  const [query,organization,location]=args;
  if(input.intent==='job'){
   if(query.length>120||organization.length>110||/[@:/]/.test(args.join(''))||
     !args.every(value=>/[\p{L}\d]/u.test(value)))
    return {type:'clarify',message:'Which role, company and optional location should I look for?'};
   // Use validated, separate arguments so a location word inside the employer name isn't re-parsed.
   const job={role:query,organization,...(location?{location}:{}),
    query:query+' '+organization+(location?' '+location:'')+' careers apply'};
   return {type:'job',job};
  }
  if(input.intent==='research'||input.intent==='compare'){
   // Online routing masks full URLs. If the user provided exact sources,
   // keep them local instead of reconstructing them from model text.
   const missing=sources.filter(url=>!query.includes(url));
   const plan=parseResearch(input.intent+' '+[query,...missing].join(' '));
   if(!plan)return {type:'clarify',message:'Which topic or pages would you like me to compare?'};
   return {type:'research',plan};
  }
  const text=input.intent==='google_search'?'Search Google for '+query:
    input.intent==='youtube_play'?'Play '+query+' on YouTube':'Type '+query+' into search';
  return {type:'skill',command:text};
 }
 if(input.args!==undefined)throw new Error('The assistant supplied unexpected command arguments.');
 if(input.intent==='profile')return {type:'profile'};
 if(input.intent==='guided')return {type:'guided'};
 if((input.intent==='youtube_tab'||input.intent==='youtube_here')&&
    (!/\byoutube\b/i.test(command)||sites.some(s=>!['youtube.com','www.youtube.com'].includes(new URL(s.url).hostname))))
  return {type:'clarify',message:'Which website would you like me to open?'};
 return {type:'skill',command:builtins[input.intent as keyof typeof builtins]};
}
