import {z} from 'zod';
const VideoChoice=z.object({id:z.string().regex(/^[\w-]{11}$/),title:z.string().min(1).max(160)});
export const VideoApproval=z.object({sourceUrl:z.string().url(),expiresAt:z.number().int(),choices:z.array(VideoChoice).min(1).max(4)});
export const Session=z.object({id:z.string(),tabId:z.number().int(),command:z.string(),phase:z.enum(['thinking','acting','waiting-confirmation','success','error','cancelled']),message:z.string(),videoApproval:VideoApproval.optional()});
export type Session=z.infer<typeof Session>;
export const Request=z.discriminatedUnion('type',[
 z.object({type:z.literal('GET_STATE')}).strict(),
 z.object({type:z.literal('START'),command:z.string().trim().min(1).max(1000)}).strict(),
 z.object({type:z.literal('PLAY_VIDEO'),sessionId:z.string().uuid(),videoId:z.string().regex(/^[\w-]{11}$/)}).strict(),
 z.object({type:z.literal('STOP')}).strict(),
 z.object({type:z.literal('SHOW_OVERLAY')}).strict()
]);
export function terminal(s:Session){return ['success','error','cancelled'].includes(s.phase)}
export function cancel(s:Session):Session{return terminal(s)?s:{...s,phase:'cancelled',message:'Stopped by user',videoApproval:undefined}}
export function mockPlan(command:string){return {type:'done' as const,summary:'Mock preview: '+command+' (no browser action performed)'}}
