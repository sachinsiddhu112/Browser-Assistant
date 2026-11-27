export default defineUnlistedScript(()=>{
 const id='browser-assistant-overlay';
 if(document.getElementById(id))return;
 const host=document.createElement('div');host.id=id;host.style.cssText='position:fixed;bottom:24px;right:24px;z-index:2147483647';
 const root=host.attachShadow({mode:'closed'});
 const style=document.createElement('style');style.textContent='section{display:flex;align-items:center;gap:12px;background:#172033;color:white;padding:12px;border-radius:16px;font:14px system-ui;box-shadow:0 4px 18px #0004} .orb{width:32px;height:32px;border-radius:50%;background:#a5b4fc} @media(prefers-reduced-motion:no-preference){section{animation:appear 190ms ease-out both}.busy{animation:pulse 1.2s ease-in-out infinite alternate}} @keyframes appear{from{opacity:0;transform:translateY(4px)}} @keyframes pulse{to{transform:scale(.94);opacity:.82}}';
 const panel=document.createElement('section'),avatar=document.createElement('span'),label=document.createElement('span'),close=document.createElement('button');
 avatar.className='orb';label.textContent='Assistant · Idle';close.textContent='×';close.setAttribute('aria-label','Close assistant');
 const listener=(raw:unknown,sender:{id?:string;tab?:unknown})=>{if(sender.id!==browser.runtime.id||sender.tab)return;const msg=raw as {type?:string;phase?:string};if(msg?.type!=='STATE'||!msg.phase||!['thinking','acting','waiting-confirmation','success','answered','needs-input','error','cancelled'].includes(msg.phase))return;label.textContent='Assistant · '+msg.phase;avatar.classList.toggle('busy',['thinking','acting'].includes(msg.phase))};
 browser.runtime.onMessage.addListener(listener);
 close.onclick=()=>{browser.runtime.onMessage.removeListener(listener);host.remove()};
 panel.append(avatar,label,close);root.append(style,panel);document.documentElement.append(host);
});
