import {z} from 'zod';
export const Session=z.object({id:z.string(),tabId:z.number().int(),command:z.string(),phase:z.enum(['thinking','acting','success','error','cancelled']),message:z.string()});
export type Session=z.infer<typeof Session>;
export const Request=z.discriminatedUnion('type',[
 z.object({type:z.literal('GET_STATE')}).strict(),
 z.object({type:z.literal('START'),command:z.string().trim().min(1).max(1000)}).strict(),
 z.object({type:z.literal('STOP')}).strict(),
 z.object({type:z.literal('SHOW_OVERLAY')}).strict()
]);
export function terminal(s:Session){return ['success','error','cancelled'].includes(s.phase)}
export function cancel(s:Session):Session{return terminal(s)?s:{...s,phase:'cancelled',message:'Stopped by user'}}
export function mockPlan(command:string){return {type:'done' as const,summary:'Mock preview: '+command+' (no browser action performed)'}}
