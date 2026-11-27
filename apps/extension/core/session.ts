import {z} from 'zod';
import {DraftField,FieldTarget,LinkTarget,GuidedDecision} from './guided-contract';
const GuidedBinding=z.object({documentId:z.string().min(1),url:z.string().url(),expiresAt:z.number().int(),steps:z.number().int().nonnegative(),canScrollUp:z.boolean(),canScrollDown:z.boolean(),fields:z.array(FieldTarget).max(16),disclosures:z.array(FieldTarget).max(8).optional(),links:z.array(LinkTarget).max(12),visited:z.array(z.string().url()).max(6).optional(),mode:z.enum(['local','cloud'])}).strict();
const VideoChoice=z.object({id:z.string().regex(/^[\w-]{11}$/),title:z.string().min(1).max(160)});
export const VideoApproval=z.object({sourceUrl:z.string().url(),expiresAt:z.number().int(),choices:z.array(VideoChoice).min(1).max(4)});
const Review=z.discriminatedUnion('type',[
 z.object({type:z.literal('expand'),target:FieldTarget}).strict(),
 z.object({type:z.literal('link'),target:LinkTarget}).strict(),
 z.object({type:z.literal('fill'),items:z.array(FieldTarget.extend({value:DraftField.shape.value})).min(1).max(8)}).strict(),
]);
export const Session=z.object({id:z.string(),tabId:z.number().int(),command:z.string(),phase:z.enum(['thinking','acting','waiting-confirmation','success','error','cancelled']),message:z.string(),videoApproval:VideoApproval.optional(),guided:GuidedBinding.optional(),draft:z.array(DraftField).max(8).optional(),review:Review.optional()});
export type Session=z.infer<typeof Session>;
export const Request=z.discriminatedUnion('type',[
 z.object({type:z.literal('GET_STATE')}).strict(),
 z.object({type:z.literal('START'),command:z.string().trim().min(1).max(1000)}).strict(),
 z.object({type:z.literal('PLAY_VIDEO'),sessionId:z.string().uuid(),videoId:z.string().regex(/^[\w-]{11}$/)}).strict(),
 z.object({type:z.literal('START_GUIDED'),mode:z.literal('local').default('local'),expectedTab:z.object({id:z.number().int().nonnegative(),url:z.string().url()}).strict().optional()}).strict(),
 z.object({type:z.literal('START_CLOUD'),mode:z.literal('cloud'),expectedTab:z.object({id:z.number().int().nonnegative(),url:z.string().url()}).strict()}).strict(),
 z.object({type:z.literal('RESUME_GUIDED'),sessionId:z.string().uuid()}).strict(),
 z.object({type:z.literal('APPROVE_GUIDED'),sessionId:z.string().uuid()}).strict(),
 z.object({type:z.literal('STEP_GUIDED'),sessionId:z.string().uuid(),decision:GuidedDecision}).strict(),
 z.object({type:z.literal('FAIL_GUIDED'),sessionId:z.string().uuid()}).strict(),
 z.object({type:z.literal('STOP')}).strict(),
 z.object({type:z.literal('SHOW_OVERLAY')}).strict()
]);
export function terminal(s:Session){return ['success','error','cancelled'].includes(s.phase)}
export function cancel(s:Session):Session{return terminal(s)?s:{...s,phase:'cancelled',message:'Stopped by user',videoApproval:undefined,guided:undefined,draft:undefined,review:undefined}}
export function mockPlan(command:string){return {type:'done' as const,summary:'Mock preview: '+command+' (no browser action performed)'}}
