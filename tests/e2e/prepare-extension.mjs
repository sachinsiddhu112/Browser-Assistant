import {readFile,writeFile,cp,rm} from 'node:fs/promises';
const source='apps/extension/.output/chrome-mv3',dest='apps/extension/.output/chrome-mv3-test';
await rm(dest,{recursive:true,force:true});await cp(source,dest,{recursive:true});
const path=dest+'/manifest.json',manifest=JSON.parse(await readFile(path,'utf8'));
manifest.host_permissions=[...(manifest.host_permissions??[]),'https://example.com/*'];
await writeFile(path,JSON.stringify(manifest,null,2));
