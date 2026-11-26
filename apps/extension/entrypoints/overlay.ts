export default defineUnlistedScript(() => {
 const id='browser-assistant-overlay';
 if(document.getElementById(id)) return;
 const host=document.createElement('div');host.id=id;
 host.style.cssText='position:fixed;bottom:24px;right:24px;z-index:2147483647';
 const root=host.attachShadow({mode:'closed'});
 const panel=document.createElement('div');
 panel.style.cssText='display:flex;align-items:center;gap:12px;background:#172033;color:white;padding:12px;border-radius:16px;font:14px system-ui;box-shadow:0 4px 18px #0004';
 const avatar=document.createElement('span');avatar.textContent='●';avatar.style.cssText='color:#a5b4fc;font-size:32px';
 const label=document.createElement('span');label.textContent='Assistant · Idle';
 const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','Close assistant');close.onclick=()=>host.remove();
 panel.append(avatar,label,close);root.append(panel);document.documentElement.append(host);
});
