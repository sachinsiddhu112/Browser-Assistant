export function applicationIntent(command:string){
 const m=/^(?:please\s+)?(?:help me\s+)?apply\s+(?:for|to)\s+(?:the\s+)?(.{2,120}?)\s+at\s+(.{2,110}?)(?:\s+using\s+(?:my\s+)?(?:saved\s+)?profile)?[.!]?$/i.exec(command.trim());
 if(!m)return null;
 const role=m[1].replace(/\s+(?:role|position|job)$/i,'').trim();
 const companyAndLocation=m[2].trim();
 const loc=/^(.+?)\s+in\s+(.+)$/i.exec(companyAndLocation);
 const organization=loc?.[1]??companyAndLocation;
 const location=loc?.[2];

 if(/[\n@:/]/.test(role+organization+(location??''))||![role,organization].every(x=>/[a-z0-9]/i.test(x)))return null;
 return {role,organization,...(location?{location}:{}),query:role+' '+organization+(location?' '+location:'')+' careers apply'};
}
export function isProfileCommand(command:string){
 return /^(?:please\s+)?(?:fill\s+(?:from\s+my\s+profile|(?:in\s+)?my\s+(?:saved\s+)?contact\s+details)|use\s+my\s+saved\s+details)[.!]?$/i.test(command.trim());
}

export function inspectJobPage(){
 const clean=(v:string)=>v.replace(/\s+/g,' ').trim();
 const visible=(el:Element)=>el.getClientRects().length>0&&getComputedStyle(el).visibility==='visible'&&!el.closest('[hidden],[inert],[aria-hidden="true"]');
 const headings=[document.title,...Array.from(document.querySelectorAll<HTMLElement>('h1,h2,[role="heading"][aria-level="1"]')).filter(visible).slice(0,10).map(el=>el.innerText)].map(x=>clean(x).slice(0,180));
 const identity=(document.body?.innerText??'').slice(0,9000);
 const inlineForm=Array.from(document.forms).some(f=>visible(f)&&!!f.querySelector('input:not([type="hidden"]),textarea'));
 const links=Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).filter(a=>visible(a)&&!a.hasAttribute('download')&&/^(apply|apply now|apply for (?:this )?(?:role|job|position)|start application|job application)(\s*[›→])?$/i.test(clean(a.innerText||a.getAttribute('aria-label')||'')))
  .slice(0,10).map(a=>({title:clean(a.innerText||a.getAttribute('aria-label')||'Application'),url:a.href}));
 return {url:location.href,headings,identity,inlineForm,links};
}
export function jobMatches(role:string,organization:string, page:{headings:string[];identity:string;url:string},location?:string){
 const normalize=(x:string)=>x.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const title=normalize(role);
 const company=normalize(organization);
 const identity=normalize(page.identity);
 const address=normalize(page.url).replace(/ /g,'');
 return !!title&&!!company&&page.headings.some(h=>(' '+normalize(h)+' ').includes(' '+title+' '))&&
  ((' '+identity+' ').includes(' '+company+' ')||address.includes(company.replace(/ /g,'')))&&
  (!location||(' '+identity+' ').includes(' '+normalize(location)+' '));
}
