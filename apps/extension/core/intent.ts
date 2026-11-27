import {Action} from '@browser-assistant/shared';
export const YOUTUBE_HOME='https://www.youtube.com/';
// Correct a single typo in an explicitly named service, never in a URL or title.
export function normalizePlatform(command:string){
 return command.replace(/(\bon\s+)([a-z]{6,8})([,.!?]*\s*)$/i,(raw,prefix,word,suffix)=>{
  const alias='youtube',token=word.toLowerCase();
  let i=0;while(i<Math.min(token.length,alias.length)&&token[i]===alias[i])i++;
  const a=token.slice(i),b=alias.slice(i);
  const near=a===b||
   (a.length===b.length&&(a.slice(1)===b.slice(1)||
    (a.length>1&&a[0]===b[1]&&a[1]===b[0]&&a.slice(2)===b.slice(2))))||
   (a.length===b.length+1&&a.slice(1)===b)||
   (a.length+1===b.length&&a===b.slice(1));
  return near?prefix+alias+suffix:raw;
 });
}
export function routeIntent(command:string):Action|null{
 const c=command.trim();
 const type=/^type (.+) into search$/i.exec(c);
 if(type)return {type:'type',elementId:0,snapshotId:'pending',text:type[1]};

 if(/^inspect page$/i.test(c))return {type:'observe'};
 if(/^page down$/i.test(c))return {type:'press_key',key:'PageDown'};
 if(/^page up$/i.test(c))return {type:'press_key',key:'PageUp'};
 if(/^go back$/i.test(c))return {type:'go_back'};
 if(/^(next|previous) tab$/i.test(c))return {type:'switch_tab',direction:c.toLowerCase().startsWith('next')?'next':'previous'};
 if(/^scroll (up|down)$/i.test(c))return {type:'scroll',direction:c.toLowerCase().endsWith('up')?'up':'down'};
 const song=/^(?:please\s+)?play\s+(?:me\s+)?(.+?)\s+on\s+youtube[,.!?]*$/i.exec(normalizePlatform(c));
 if(song)return {type:'navigate',url:'https://www.youtube.com/results?search_query='+encodeURIComponent(song[1])};
 // Match only a complete, explicit command for the fixed YouTube destination.
 const tabCommand=c.replace(/[ \t]+/g,' ');
 if(/^(?:please )?open youtube? in (?:(?:a|another) )?new tab using (?:https:\/\/)?(?:www\.)?youtube\.com\/?[.!?]?$/i.test(tabCommand))
  return {type:'open_youtube_tab'};
 if(/^(?:please )?open (?:(?:a )?new tab (?:for|to|with) youtube(?:\.com)?|youtube(?:\.com)? in (?:(?:a|another) )?new tab)[.!?]?$/i.test(tabCommand))
  return {type:'open_youtube_tab'};
 if(/^open youtube$/i.test(c))return {type:'navigate',url:YOUTUBE_HOME};
 const google=/^search google for (.+)$/i.exec(c);
 if(google)return {type:'navigate',url:'https://www.google.com/search?q='+encodeURIComponent(google[1])};
 return null;
}
export function allowedNavigation(url:string){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&((u.hostname==='www.youtube.com'&&((u.pathname==='/'&&!u.search)||(u.pathname==='/results'&&u.searchParams.has('search_query')&&Array.from(u.searchParams.keys()).every(k=>k==='search_query'))||(u.pathname==='/watch'&&/^[\w-]{11}$/.test(u.searchParams.get('v')??'')&&Array.from(u.searchParams.keys()).every(k=>k==='v'))))||(u.hostname==='www.google.com'&&u.pathname==='/search'&&u.searchParams.has('q')&&Array.from(u.searchParams.keys()).every(k=>k==='q')))}catch{return false}}
