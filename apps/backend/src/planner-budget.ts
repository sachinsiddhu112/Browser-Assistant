import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {isAbsolute,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

const MINUTE=60_000;
const PER_IP=10;

export function plannerClientIp(headers:Record<string,string|string[]|undefined>,remote:string|undefined,railway:boolean):string|undefined{
 // On Railway, accept only the address supplied by the public edge. Never read
 // X-Forwarded-For or a client-chosen installation ID.
 const raw=railway?headers['x-real-ip']:remote;
 if(typeof raw!=='string'||!isIP(raw)||raw.includes('%'))return;
 if(isIP(raw)===4)return raw;
 const canonical=new URL('http://['+raw+']/').hostname.slice(1,-1);
 if(!canonical.startsWith('::ffff:'))return canonical;
 const hex=canonical.slice(7).split(':');
 if(hex.length!==2)return canonical;
 return hex.flatMap(part=>{const n=Number.parseInt(part,16);return [n>>8,n&255]}).join('.');
}

export function plannerBudgetConfig(env:NodeJS.ProcessEnv){
 const railway=!!env.RAILWAY_ENVIRONMENT_ID;
 const directory=railway?env.RAILWAY_VOLUME_MOUNT_PATH:env.PLANNER_BUDGET_DIR;
 const limit=env.PLANNER_DAILY_CALL_CAP;
 if(!directory||!isAbsolute(directory)||!limit||!/^\d{1,4}$/.test(limit))return;
 const daily=Number(limit);
 if(daily<1||daily>1000)return;
 return {file:join(railway?join(directory,'planner-budget'):directory,'browser-assistant-budget.sqlite'),daily,railway};
}

export class PlannerBudget{
 private readonly db:DatabaseSync;
 private readonly salt:string;
 constructor(file:string){
  this.db=new DatabaseSync(file);
  try{
   this.db.exec(`
    PRAGMA busy_timeout=750;
    PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT NOT NULL);
    INSERT OR IGNORE INTO settings VALUES (1,lower(hex(randomblob(32))));
    CREATE TABLE IF NOT EXISTS admitted (ip TEXT NOT NULL, at_ms INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS admitted_time ON admitted(at_ms);
    CREATE INDEX IF NOT EXISTS admitted_ip ON admitted(ip);
    CREATE TABLE IF NOT EXISTS day_counts (day TEXT PRIMARY KEY, n INTEGER NOT NULL);
   `);
   const salt=this.db.prepare('SELECT salt FROM settings WHERE id=1').get()?.salt;
   if(typeof salt!=='string'||!/^[a-f\d]{64}$/.test(salt))throw new Error('Invalid budget database');
   this.salt=salt;
  }catch(error){this.db.close();throw error}
 }
 take(ip:string,dailyCap:number,now=Date.now()):'ok'|'ip'|'daily'{
  const bucket=createHmac('sha256',this.salt).update(ip).digest('hex');
  const day=new Date(now).toISOString().slice(0,10);
  // Reserve before the external call; even a failed or interrupted call counts.
  this.db.exec('BEGIN IMMEDIATE');
  try{
   this.db.prepare('DELETE FROM admitted WHERE at_ms<=?').run(now-MINUTE);
   const recent=Number(this.db.prepare('SELECT COUNT(*) AS n FROM admitted WHERE ip=?').get(bucket)?.n);
   const used=Number(this.db.prepare('SELECT n FROM day_counts WHERE day=?').get(day)?.n??0);
   const decision=recent>=PER_IP?'ip':used>=dailyCap?'daily':'ok';
   if(decision==='ok'){
    this.db.prepare('INSERT INTO admitted VALUES (?,?)').run(bucket,now);
    this.db.prepare('INSERT INTO day_counts VALUES (?,1) ON CONFLICT(day) DO UPDATE SET n=n+1').run(day);
   }
   this.db.exec('COMMIT');
   return decision;
  }catch(error){
   try{this.db.exec('ROLLBACK')}catch{/* original error is handled by the planner */}
   throw error;
  }
 }
 close(){this.db.close()}
}
