/** Explicit local, model-free form drafts; never submit or infer data. */
export function parseFormIntent(command:string){
 const pairs=command.trim().split(/;\s*(?=(?:fill\s+)?"[^"]+"\s+with\s+")/i);
 if(pairs.length>8)return null;
 const entries:{label:string;value:string}[]=[];
 for(let i=0;i<pairs.length;i++){
  const match=(i===0?/^fill\s+"([^"\r\n]{1,160})"\s+with\s+"([^"\r\n]{1,160})"$/i:/^(?:fill\s+)?"([^"\r\n]{1,160})"\s+with\s+"([^"\r\n]{1,160})"$/i).exec(pairs[i]);
  if(!match||!match[1].trim()||!match[2].trim())return null;
  const label=match[1].replace(/\s+/g,' ').trim();
  if(entries.some(x=>x.label.toLowerCase()===label.toLowerCase()))return null;
  entries.push({label,value:match[2]});
 }
 return entries;
}
