import {chownSync,lstatSync,mkdirSync} from 'node:fs';
import {isAbsolute,join} from 'node:path';

// The Railway Docker image normally runs as `node`. If deployment is
// explicitly started as root to initialize a Railway volume, relinquish that
// identity before the HTTP server or provider integration loads.
if(process.getuid?.()===0&&process.setgroups&&process.setgid&&process.setuid){
 const volume=process.env.RAILWAY_VOLUME_MOUNT_PATH;
 if(process.env.PLANNER_PUBLIC_ENABLED==='true'&&volume&&isAbsolute(volume)){
  const directory=join(volume,'planner-budget');
  try{
   mkdirSync(directory,{mode:0o700});
  }catch(error){
   if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
  }
  if(!lstatSync(directory).isDirectory())throw new Error('Invalid planner budget directory');
  chownSync(directory,1000,1000);
 }
 process.setgroups([]);
 process.setgid(1000);
 process.setuid(1000);
}
require('./main');
