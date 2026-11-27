import {Action} from '@browser-assistant/shared';
export const YOUTUBE_HOME='https://www.youtube.com/';
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
 const song=/^play (.+) on youtube$/i.exec(c);
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
