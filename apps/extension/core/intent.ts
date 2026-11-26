import {Action} from '@browser-assistant/shared';
export function routeIntent(command:string):Action|null{
 const c=command.trim();
 if(/^scroll (up|down)$/i.test(c))return {type:'scroll',direction:c.toLowerCase().endsWith('up')?'up':'down'};
 if(/^open youtube$/i.test(c))return {type:'navigate',url:'https://www.youtube.com/'};
 const google=/^search google for (.+)$/i.exec(c);
 if(google)return {type:'navigate',url:'https://www.google.com/search?q='+encodeURIComponent(google[1])};
 return null;
}
export function allowedNavigation(url:string){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&((u.hostname==='www.youtube.com'&&u.pathname==='/'&&!u.search)||(u.hostname==='www.google.com'&&u.pathname==='/search'&&u.searchParams.has('q')&&Array.from(u.searchParams.keys()).every(k=>k==='q')))}catch{return false}}
