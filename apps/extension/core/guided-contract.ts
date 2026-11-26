import {z} from 'zod';

export const MAX_GUIDED_STEPS = 5;
export const GUIDED_TIMEOUT_MS = 45_000;
const Text = z.string().trim().min(1).max(160);
export const GuidedDecision = z.discriminatedUnion('type', [
  z.object({type:z.literal('scroll'),direction:z.enum(['up','down'])}).strict(),
  z.object({type:z.literal('finish'),answer:z.string().trim().min(1).max(900)}).strict(),
  z.object({type:z.literal('ask'),question:z.string().trim().min(1).max(300)}).strict(),
  z.object({type:z.literal('draft'),entries:z.array(z.object({
    field:z.number().int().min(0).max(15),
    value:z.string().trim().min(1).max(160),
  }).strict()).min(1).max(8)}).strict(),
]);
export type GuidedDecision = z.infer<typeof GuidedDecision>;
export const GuidedSnapshot = z.object({
  text:z.array(Text).max(20),
  fields:z.array(Text).max(16),
  canScrollUp:z.boolean(),
  canScrollDown:z.boolean(),
}).strict();
export type GuidedSnapshot = z.infer<typeof GuidedSnapshot>;
export const DraftField=z.object({label:Text,value:Text}).strict();

export function parseGuidedDecision(raw:string):GuidedDecision {
  if(raw.length>3000)throw new Error('The on-device model returned an oversized step.');
  try{return GuidedDecision.parse(JSON.parse(raw));}catch{throw new Error('The on-device model did not return a supported step. No action was taken for that step.');}
}

export function labelDraft(fields:string[], entries:Extract<GuidedDecision,{type:'draft'}>['entries']) {
  const seen=new Set<number>();
  return entries.map(entry=>{
    const label=fields[entry.field];
    if(!label||seen.has(entry.field))throw new Error('The draft did not match the fields in view.');
    seen.add(entry.field);
    return DraftField.parse({label,value:entry.value});
  });
}
