import {z} from 'zod';
import {parseSiteIntent} from './site-intent';

const builtins = {
 youtube_tab:'Open YouTube in a new tab', youtube_here:'Open YouTube',
 scroll_up:'Scroll up', scroll_down:'Scroll down', page_up:'Page up', page_down:'Page down',
 back:'Go back', next_tab:'Next tab', previous_tab:'Previous tab', inspect:'Inspect page',
} as const;
const choices = ['open_site','guided','clarify',...Object.keys(builtins)] as [string,...string[]];
const Decision = z.object({intent:z.enum(choices),
 target:z.number().int().min(0).max(5).optional(), question:z.string().trim().min(1).max(200).optional()}).strict();

export type IntentOutcome =
 | {type:'skill';command:string}
 | {type:'site';site:NonNullable<ReturnType<typeof parseSiteIntent>>}
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
 'Return a single JSON object with "intent". Allowed keys: intent, target, question. Do not invent URLs or command text.',
 'Single requests: youtube_tab (YouTube in a new tab or keeping the current tab), youtube_here (open YouTube without a new tab), scroll_up, scroll_down, page_up, page_down, back, next_tab, previous_tab, inspect.',
 'If the user asks to open a specific supplied candidate website in a new tab (or gives no tab preference), use open_site with the exact integer target index from sites. A literal destination outweighs misspelling. Multiple plausible targets, unspecified sites, blank tabs, or non-YouTube same-tab site requests need clarify.',
 'Use guided for questions about the current page, or actions on its observed content or controls. Never classify questions about links as permission to open a site.',
 'Use clarify with a brief question or limitation if the request is ambiguous, negated, unsupported, asks to submit or upload, or mixes browser skills with other actions. Never strip a second action and silently perform only the first.',
 'Examples: "Could you pop YouTube into its own tab?" → youtube_tab; "keep this page and bring youtube up beside it" → youtube_tab; "does this page link to youtube?" → guided; "take me to the tab on the left" → previous_tab.',
].join('\n');

export function resolveIntent(raw:unknown,command:string,sites=commandSites(command)):IntentOutcome{
 const input=Decision.parse(raw);
 if(input.intent==='clarify'&&input.target===undefined&&input.question)return {type:'clarify',message:input.question};
 if(input.intent==='open_site'&&input.question===undefined&&input.target!==undefined&&sites[input.target])
  return {type:'site',site:sites[input.target]};
 if(input.target!==undefined||input.question!==undefined||input.intent==='clarify'||input.intent==='open_site')
  throw new Error('The assistant did not return a usable browser intent.');
 if(input.intent==='guided')return {type:'guided'};
 if((input.intent==='youtube_tab'||input.intent==='youtube_here')&&
    (!/\byoutube\b/i.test(command)||sites.some(s=>!['youtube.com','www.youtube.com'].includes(new URL(s.url).hostname))))
  return {type:'clarify',message:'Which website would you like me to open?'};
 return {type:'skill',command:builtins[input.intent as keyof typeof builtins]};
}
