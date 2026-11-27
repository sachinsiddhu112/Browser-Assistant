import { z } from 'zod';
export const AvatarState = z.enum(['idle','listening','thinking','acting','waiting-confirmation','success','error']);
export const Action = z.discriminatedUnion('type', [
  z.object({type:z.literal('navigate'),url:z.string().url()}).strict(),
  z.object({type:z.literal('open_youtube_tab')}).strict(),
  z.object({type:z.literal('click'),elementId:z.number().int().nonnegative(),snapshotId:z.string()}).strict(),
  z.object({type:z.literal('type'),elementId:z.number().int().nonnegative(),snapshotId:z.string(),text:z.string().max(4000)}).strict(),
  z.object({type:z.literal('scroll'),direction:z.enum(['up','down'])}).strict(),
  z.object({type:z.literal('observe')}).strict(),
  z.object({type:z.literal('press_key'),key:z.enum(['Escape','ArrowDown','ArrowUp','PageDown','PageUp','Home','End'])}).strict(),
  z.object({type:z.literal('go_back')}).strict(),
  z.object({type:z.literal('switch_tab'),direction:z.enum(['next','previous'])}).strict(),
  z.object({type:z.literal('done'),summary:z.string()}).strict()
]);
export type AvatarState = z.infer<typeof AvatarState>;
export type Action = z.infer<typeof Action>;
export const OverlayMessage = z.object({type:z.literal('SHOW_OVERLAY')}).strict();
