import {Action} from '@browser-assistant/shared';
export function routeIntent(command:string):Action|null{
 const c=command.trim();
 if(/^go back$/i.test(c))return {type:'go_back'};
 if(/^(next|previous) tab$/i.test(c))return {type:'switch_tab',direction:c.toLowerCase().startsWith('next')?'next':'previous'};
 if(/^scroll (up|down)$/i.test(c))return {type:'scroll',direction:c.toLowerCase().endsWith('up')?'up':'down'};
 const song=/^play (.+) on youtube$/i.exec(c);
 if(song)return {type:'navigate',url:'https://www.youtube.com/results?search_query='+encodeURIComponent(song[1])};
 if(/^open youtube$/i.test(c))return {type:'navigate',url:'https://www.youtube.com/'};
 const google=/^search google for (.+)$/i.exec(c);
 if(google)return {type:'navigate',url:'https://www.google.com/search?q='+encodeURIComponent(google[1])};
 return null;
}
export function allowedNavigation(url:string){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&((u.hostname==='www.youtube.com'&&((u.pathname==='/'&&!u.search)||(u.pathname==='/results'&&u.searchParams.has('search_query')&&Array.from(u.searchParams.keys()).every(k=>k==='search_query'))||(u.pathname==='/watch'&&/^[\w-]{11}$/.test(u.searchParams.get('v')??'')&&Array.from(u.searchParams.keys()).every(k=>k==='v'))))||(u.hostname==='www.google.com'&&u.pathname==='/search'&&u.searchParams.has('q')&&Array.from(u.searchParams.keys()).every(k=>k==='q')))}catch{return false}}
