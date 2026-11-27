/** The browser opens only literal addresses supplied by the user, never model output. */
export function parseSiteIntent(command:string){
 const match=/^(?:please\s+)?open\s+((?:https:\/\/)?[a-z0-9.-]+\.[a-z]{2,63}(?:\/[a-z0-9/_.~-]*)?)(?:\s+in\s+(?:a\s+)?new tab)?(?:,\s*(?:then\s+)?(.+))?$/i.exec(command.trim());
 if(!match)return null;
 try{
  const url=new URL(/^https:\/\//i.test(match[1])?match[1]:'https://'+match[1]);
  if(url.protocol!=='https:'||url.port||url.username||url.password||url.search||url.hash||
   !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(url.hostname)||
   /(?:^|\.)(?:local|localhost|internal|test|invalid)$/i.test(url.hostname)||
   /(?:^|[\/_.-])(?:logout|signout|delete|remove|purchase|unsubscribe|checkout|cancel|submit|download)(?:[\/_.-]|$)/i.test(url.pathname))return null;
  return {url:url.href,origin:url.origin,goal:match[2]?.trim()};
 }catch{return null}
}
