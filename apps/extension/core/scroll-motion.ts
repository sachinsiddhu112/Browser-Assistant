/** Self-contained for chrome.scripting.executeScript; no imported runtime state. */
export async function movePage(direction:'up'|'down',distance:'viewport'|'arrow'|'edge'='viewport'){
 const scrolling=document.scrollingElement;
 if(!scrolling)return 'edge';
 const root=scrolling;
 const before=root.scrollTop, max=Math.max(0,root.scrollHeight-root.clientHeight);
 const sign=direction==='up'?-1:1;
 const amount=distance==='arrow'?40:Math.max(1,Math.round(root.clientHeight*.8));
 const target=distance==='edge'?(sign===1?max:0):Math.max(0,Math.min(max,before+sign*amount));
 if(Math.abs(target-before)<1)return 'edge';
 const didMove=()=>sign*(root.scrollTop-before)>=1;
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){
  root.scrollTo({top:target,behavior:'instant'});
  return didMove()?'moved':'interrupted';
 }

 return new Promise<'moved'|'interrupted'>(resolve=>{
  let frame=0,timer=0,finished=false,previous=before;
  let lastChange=performance.now();
  const started=lastChange;
  function settle(result:'moved'|'interrupted'){
   if(finished)return;finished=true;
   cancelAnimationFrame(frame);clearTimeout(timer);
   document.removeEventListener('scrollend',onEnd);
   window.removeEventListener('wheel',onInput,true);
   window.removeEventListener('touchstart',onInput,true);
   window.removeEventListener('pointerdown',onInput,true);
   window.removeEventListener('keydown',onInput,true);
   resolve(result);
  }
  function onEnd(){if(didMove())settle('moved')}
  function onInput(event:Event){
   if(!event.isTrusted)return;
   if(event instanceof KeyboardEvent&&!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' ','Escape'].includes(event.key))return;
   // Yield to real input; never prevent the person's own scroll or click.
   settle('interrupted');
  }
  function sample(now:number){
   if(root.scrollTop!==previous){previous=root.scrollTop;lastChange=now}
   if(didMove()&&now-started>=140&&now-lastChange>=90){settle('moved');return}
   frame=requestAnimationFrame(sample);
  }
  document.addEventListener('scrollend',onEnd);
  window.addEventListener('wheel',onInput,{capture:true,passive:true});
  window.addEventListener('touchstart',onInput,{capture:true,passive:true});
  window.addEventListener('pointerdown',onInput,{capture:true,passive:true});
  window.addEventListener('keydown',onInput,true);
  timer=window.setTimeout(()=>settle('interrupted'),1400);
  frame=requestAnimationFrame(sample);
  root.scrollTo({top:target,behavior:'smooth'});
 });
}
