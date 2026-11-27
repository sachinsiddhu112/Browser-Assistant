/** Compare the intended destination, not presentation params or query encoding. */
export function sameYouTubeDestination(actual:string|undefined,expected:string){
 if(!actual)return false;
 try{
  const a=new URL(actual),e=new URL(expected);
  if(a.origin!=='https://www.youtube.com'||a.origin!==e.origin||a.pathname!==e.pathname||
     a.username||a.password||a.hash)return false;
  const key=e.pathname==='/results'?'search_query':e.pathname==='/watch'?'v':null;
  if(!key)return false;
  const values=a.searchParams.getAll(key);
  const value=e.searchParams.get(key);
  return !!value&&values.length===1&&values[0]===value&&
    (key!=='v'||(!a.searchParams.has('list')&&!a.searchParams.has('t')));
 }catch{return false}
}

/** Runs in the verified search document. No model, clicks, or page-provided code. */
export function readYouTubeChoices(expectedQuery:string){
 if(location.origin!=='https://www.youtube.com'||location.pathname!=='/results')return [];
 const requested=new URL(location.href).searchParams.getAll('search_query');
 if(requested.length!==1||requested[0]!==expectedQuery)return [];
 const choices:{id:string;title:string}[]=[];
 const results='ytd-video-renderer,yt-lockup-view-model,ytd-rich-item-renderer';
 const candidates=Array.from(document.querySelectorAll<HTMLAnchorElement>(
  'ytd-video-renderer a#video-title[href],yt-lockup-view-model a[href],ytd-rich-item-renderer a[href],main a[href],#contents a[href]'
 )).slice(0,300);
 for(const a of candidates){
  if(!a.getClientRects().length||getComputedStyle(a).visibility!=='visible'||
     a.closest('[hidden],[inert],[aria-hidden="true"],ytd-promoted-sparkles-web-renderer,ytd-ad-slot-renderer,ytd-display-ad-renderer,[data-ad]'))continue;
  const u=new URL(a.href),ids=u.searchParams.getAll('v');
  if(u.origin!=='https://www.youtube.com'||u.pathname!=='/watch'||u.username||u.password||ids.length!==1||
     !/^[\w-]{11}$/.test(ids[0])||choices.some(x=>x.id===ids[0]))continue;
  const inResult=a.closest(results);
  // Avoid thumbnail-only labels, generic navigation, and hidden results.
  const title=(a.textContent?.trim()||a.title||(inResult&&a.id==='video-title'?a.getAttribute('aria-label'):'')||'')
    .replace(/\s+/g,' ').trim().slice(0,160);
  if(!title)continue;
  choices.push({id:ids[0],title});
  if(choices.length===4)break;
 }
 return choices;
}

/** Probe or make a single ordinary media play request using Chrome's policy. */
export async function inspectYouTubePlayer(expectedVideo:string,attempt:boolean){
 const ids=new URL(location.href).searchParams.getAll('v');
 if(location.origin!=='https://www.youtube.com'||location.pathname!=='/watch'||ids.length!==1||ids[0]!==expectedVideo)
  return {state:'changed'} as const;
 const player=document.querySelector('#movie_player');
 if(!player||player.matches('.ad-showing,.ad-interrupting')||document.visibilityState!=='visible')return {state:'waiting'} as const;
 const video=player.querySelector<HTMLVideoElement>('video.html5-main-video,video');
 if(!video||video.readyState<2||video.ended)return {state:'waiting'} as const;
 if(!video.paused)return {state:'running',time:video.currentTime,muted:video.muted||video.volume===0} as const;
 if(!attempt)return {state:'paused'} as const;
 try{
  await Promise.race([video.play(),new Promise<void>(resolve=>setTimeout(resolve,600))]);
  return {state:'attempted'} as const;
 }catch(e){
  return {state:e instanceof DOMException&&e.name==='NotAllowedError'?'blocked':'attempted'} as const;
 }
}
