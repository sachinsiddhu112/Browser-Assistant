import {test,expect,chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
test('extension local navigation and scrolling',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'assistant-'));
 const extension=resolve('apps/extension/.output/chrome-mv3-test');
 const context=await chromium.launchPersistentContext(dir,{channel:'chromium',headless:process.env.PW_HEADLESS==='1',args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  const site=await context.newPage();
  await site.route('https://example.com/**',route=>route.fulfill({contentType:'text/html',body:'<html><body style="height:5000px"><h1>Fixture</h1><input type="search" aria-label="Search"><input type="password" aria-label="Secret"></body></html>'}));
  await site.goto('https://example.com/');
  // Grant fixture-only host access via test manifest; no production permission changes.
  const panel=await context.newPage();
  await panel.goto('chrome-extension://'+id+'/sidepanel.html');
  await expect(panel.getByRole('heading',{name:'Browser Assistant'})).toBeVisible();
  // A standalone side panel tab is not the real Chrome side panel. Drive trusted
  // extension messages from it while keeping the fixture tab active.
  await site.bringToFront();
  const send=(type:string,extra:object={})=>panel.evaluate(async({type,extra})=>(globalThis as any).chrome.runtime.sendMessage({type,...extra}),{type,extra});
  expect((await send('SHOW_OVERLAY')).ok).toBe(true);
  await expect(site.locator('#browser-assistant-overlay')).toBeVisible();
  const readScrollSamples=()=>site.evaluate(()=>(globalThis as typeof globalThis & {fixtureScroll:number[]}).fixtureScroll);
  await site.emulateMedia({reducedMotion:'no-preference'});
  await site.evaluate(()=>{
   const state=globalThis as typeof globalThis & {fixtureScroll:number[]};
   state.fixtureScroll=[];
   document.addEventListener('scroll',()=>state.fixtureScroll.push(scrollY));
  });
  expect((await send('START',{command:'Scroll down'})).ok).toBe(true);
  await expect.poll(async()=> (await send('GET_STATE')).session?.message).toBe('Page scrolled');
  const scrolled=await site.evaluate(()=>scrollY);
  expect(scrolled).toBeGreaterThan(0);
  expect((await readScrollSamples()).some(y=>y>0&&y<scrolled)).toBe(true);

  await site.emulateMedia({reducedMotion:'reduce'});
  await site.evaluate(()=>{(globalThis as typeof globalThis & {fixtureScroll:number[]}).fixtureScroll=[]});
  expect((await send('START',{command:'Page up'})).ok).toBe(true);
  await expect.poll(async()=> (await send('GET_STATE')).session?.message).toBe('Page scrolled');
  await expect.poll(readScrollSamples).toEqual([0]);
  expect((await send('START',{command:'Page up'})).ok).toBe(true);
  await expect.poll(async()=> (await send('GET_STATE')).session?.message).toBe('Already at the edge of the page');
  await panel.emulateMedia({reducedMotion:'reduce'});
  await expect(panel.locator('.result-message')).toHaveCSS('animation-name','none');
  await panel.emulateMedia({reducedMotion:'no-preference'});
  await expect(panel.locator('.result-message')).toHaveCSS('animation-name','assistant-appear');
  expect((await send('START',{command:'Inspect page'})).ok).toBe(true);
  await expect.poll(async()=> (await send('GET_STATE')).session?.message).toContain('Observed 1 interactive elements');
  expect((await send('START',{command:'Type NestJS into search'})).ok).toBe(true);
  await expect.poll(async()=> (await send('GET_STATE')).session?.phase).toBe('success');
  await expect(site.getByRole('searchbox')).toHaveValue('NestJS');
  await expect(site.locator('input[type=password]')).toHaveValue('');
  await context.route(/^https:\/\/www\.youtube\.com\//,route=>{
   const {pathname}=new URL(route.request().url());
   const body=pathname==='/results'?`<html><body>
   <ytd-video-renderer><a id="video-title" href="/watch?v=abcdefghijk">First song</a></ytd-video-renderer>
   <ytd-video-renderer><a id="video-title" href="/watch?v=lmnopqrstuv">Second song</a></ytd-video-renderer>
   <ytd-video-renderer hidden><a id="video-title" href="/watch?v=zyxwvutsrqp">Hidden song</a></ytd-video-renderer>
   <ytd-video-renderer><a id="video-title" href="https://attacker.invalid/watch?v=zyxwvutsrqp">Off-site song</a></ytd-video-renderer>
  </body></html>`:pathname==='/watch'?'<h1>Video fixture</h1>':'<h1>YouTube fixture</h1>';
   return route.fulfill({contentType:'text/html',body});
  });
  expect((await send('START',{command:'Open YouTube'})).ok).toBe(true);
  await expect.poll(async()=> (await send('GET_STATE')).session?.phase).toBe('success');
  await expect(site).toHaveURL('https://www.youtube.com/');
  expect((await send('START',{command:'Go back'})).ok).toBe(true);
  await expect.poll(async()=> (await send('GET_STATE')).session?.phase).toBe('success');
  await expect(site).toHaveURL('https://example.com/');
  const started=await send('START',{command:'Play Example on YouTube'});
  expect(started.ok).toBe(true);
  await expect.poll(async()=> (await send('GET_STATE')).session?.phase).toBe('waiting-confirmation');
  await expect(site).toHaveURL('https://www.youtube.com/results?search_query=Example');
  await expect(panel.getByRole('button',{name:'First song'})).toBeVisible();
  await expect(panel.getByRole('button',{name:'Second song'})).toBeVisible();
  await expect(panel.getByRole('button',{name:'Hidden song'})).toHaveCount(0);
  await expect(panel.getByRole('button',{name:'Off-site song'})).toHaveCount(0);
  expect((await send('PLAY_VIDEO',{sessionId:started.session.id,videoId:'zyxwvutsrqp'})).ok).toBe(false);
  await site.bringToFront();
  expect((await send('PLAY_VIDEO',{sessionId:started.session.id,videoId:'lmnopqrstuv'})).ok).toBe(true);
  await expect(site).toHaveURL('https://www.youtube.com/watch?v=lmnopqrstuv');
  await expect.poll(async()=> (await send('GET_STATE')).session?.message,{timeout:15000}).toContain('playback was not verified');

  const stopped=await send('START',{command:'Play Example on YouTube'});
  await expect.poll(async()=> (await send('GET_STATE')).session?.phase).toBe('waiting-confirmation');
  expect((await send('STOP')).session.phase).toBe('cancelled');
  expect((await send('PLAY_VIDEO',{sessionId:stopped.session.id,videoId:'abcdefghijk'})).ok).toBe(false);
  await expect(site).toHaveURL('https://www.youtube.com/results?search_query=Example');
  await panel.reload();
  await expect(panel.getByRole('status')).toContainText('cancelled');
  await panel.evaluate(()=>{globalThis.fetch=async()=>{throw new Error('The local command must not call a planner')}});
  await panel.getByRole('textbox',{name:'Command'}).fill('Open a new tab for YouTube');
  await site.bringToFront();
  const newTab=context.waitForEvent('page');
  await panel.evaluate(()=>document.querySelector('form')?.requestSubmit());
  const opened=await newTab;
  await expect(opened).toHaveURL('https://www.youtube.com/');
  await expect(site).toHaveURL('https://www.youtube.com/results?search_query=Example');
  await expect(panel.getByRole('status')).toContainText('Opened YouTube in a new tab');
 }finally{await context.close();await rm(dir,{recursive:true,force:true})}
});

test('free-form goal chooses next steps from the real browser, and drafts without typing',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'assistant-guided-'));
 const extension=resolve('apps/extension/.output/chrome-mv3-test');
 const context=await chromium.launchPersistentContext(dir,{channel:'chromium',headless:process.env.PW_HEADLESS==='1',args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  const site=await context.newPage();
  await site.route('https://example.com/**',route=>route.request().url().endsWith('/details')?route.fulfill({contentType:'text/html',body:'<main><h1>Role details page</h1><details><summary>Benefits</summary><p>Training budget is available.</p></details></main>'}):route.fulfill({contentType:'text/html',body:`<!doctype html><main>
   <h1>Apply to the workspace</h1>
   <p>Scroll down for the application deadline.</p>
   <div style="height:720px"></div>
   <p>Applications close on Friday.</p>
   <label>Full name <input type="text"></label><a href="/details">Role details</a><a href="https://external.invalid/details">Off-site details</a>
   <label>Password <input type="password" value="fixture-only-never-read"></label>
   <div style="height:600px"></div>
  </main>`}));
  await site.goto('https://example.com/');
  const panel=await context.newPage();
  await panel.goto('chrome-extension://'+id+'/sidepanel.html');
  await panel.evaluate(()=>{
   globalThis.fetch=async()=>{throw new Error('A ready local model must not call online fallback')};
   Object.defineProperty(globalThis,'LanguageModel',{configurable:true,value:{
    availability:async()=> 'available',
    create:async()=>({
     prompt:async (input:string)=>{
      const {goal,view,previousSteps}=JSON.parse(input);
      if(input.includes('fixture-only-never-read')||view.fields.includes('Password'))throw new Error('Sensitive field leaked');
      if(goal.includes('details')){
       if(view.links.includes('Off-site details'))throw new Error('Unexpected off-site link');
       if(view.text.includes('Training budget is available.'))return JSON.stringify({type:'finish',answer:'Verified: training budget is available.'});
       if(view.text.includes('Role details page'))return JSON.stringify({type:'expand',disclosure:view.disclosures.indexOf('Benefits')});
       return JSON.stringify({type:'open_link',link:view.links.indexOf('Role details')});
      }
      if(goal.includes('name'))return JSON.stringify({type:'draft',entries:[{field:view.fields.indexOf('Full name'),value:'Sachin'}]});
      if(view.text.includes('Applications close on Friday.')){
       if(previousSteps.length!==1)throw new Error('Expected one prior scroll');
       return JSON.stringify({type:'finish',answer:'Applications close on Friday.'});
      }
      return JSON.stringify({type:'scroll',direction:'down'});
     },
     destroy:()=>{},
    }),
   }});
  });
  const run=async(text:string)=>{
   await panel.getByRole('textbox',{name:'Command'}).fill(text);
   await site.bringToFront();
   await panel.evaluate(()=>document.querySelector('form')?.requestSubmit());
  };
  await run('Could you find the deadline further down this page?');
  await expect(panel.getByRole('status')).toContainText('Applications close on Friday.');
  expect(await site.evaluate(()=>scrollY)).toBeGreaterThan(0);
  await run('Could you draft my name as Sachin?');
  await expect(panel.getByRole('region',{name:'Form draft'})).toContainText('Sachin');
  await expect(site.getByRole('textbox',{name:'Full name'})).toHaveValue('');
  await expect(site.getByLabel('Password')).toHaveValue('fixture-only-never-read');
  const decide=async(label:string)=>{
   await site.bringToFront();
   await panel.getByRole('button',{name:label,exact:true}).evaluate((button:HTMLButtonElement)=>button.click());
  };
  await decide('Fill these fields');
  await expect(site.getByRole('textbox',{name:'Full name'})).toHaveValue('Sachin');
  await expect(panel.getByRole('status')).toContainText('Filled 1 reviewed fields');
  await site.getByRole('textbox',{name:'Full name'}).fill('');

  await run('Could you draft my name as Sachin?');
  await expect(panel.getByRole('region',{name:'Form draft'})).toContainText('Sachin');
  await site.getByRole('textbox',{name:'Full name'}).evaluate(e=>e.replaceWith(e.cloneNode()));
  await decide('Fill these fields');
  await expect(panel.getByRole('status')).toContainText('Verified 0 of 1 fields');
  await expect(site.getByRole('textbox',{name:'Full name'})).toHaveValue('');

  await run('Fill "Full name" with "Sachin"');
  await expect(panel.getByRole('region',{name:'Form draft'})).toContainText('Sachin');
  await expect(site.getByRole('textbox',{name:'Full name'})).toHaveValue('');
  await decide('Fill these fields');
  await expect(site.getByRole('textbox',{name:'Full name'})).toHaveValue('Sachin');
  await expect(site.getByLabel('Password')).toHaveValue('fixture-only-never-read');

  await run('Could you open the role details?');
  await expect(panel.getByRole('region',{name:'Link review'})).toContainText('https://example.com/details');
  await expect(site).toHaveURL('https://example.com/');
  await decide('Open this link');
  await expect(site).toHaveURL('https://example.com/details');
  await expect(panel.getByRole('region',{name:'Disclosure review'})).toContainText('Benefits');
  await expect(site.locator('details')).not.toHaveAttribute('open','');
  await decide('Expand and continue');
  await expect(site.locator('details')).toHaveAttribute('open','');
  await expect(panel.getByRole('status')).toContainText('Verified: training budget is available.');

 }finally{await context.close();await rm(dir,{recursive:true,force:true})}
});

test('one Run task click uses automatic fallback and retains link review',async({},testInfo)=>{
 const dir=await mkdtemp(resolve(tmpdir(),'assistant-fallback-'));
 const extension=resolve('apps/extension/.output/chrome-mv3-test');
 const context=await chromium.launchPersistentContext(dir,{channel:'chromium',headless:process.env.PW_HEADLESS==='1',args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  const site=await context.newPage();
  await site.route('https://example.com/**',route=>route.fulfill({contentType:'text/html',body:route.request().url().endsWith('/guide')
   ?'<main><h1>Public guide fixture</h1></main>'
   :'<!doctype html><main style="height:4500px"><h1>Public fixture</h1><a href="/guide">Guide</a><label>Private fixture label <input value="test-only-private-value"></label></main>'}));
  await site.goto('https://example.com/');
  const panel=await context.newPage();
  await panel.goto('chrome-extension://'+new URL(worker.url()).host+'/sidepanel.html');
  await panel.evaluate(()=>{
   const globals=globalThis as any;
   globals.fixtureCalls=[];
   Object.defineProperty(globalThis,'LanguageModel',{configurable:true,value:{
    availability:async()=> 'downloadable',
    create:async()=>{throw new Error('A downloadable model must not be started automatically')},
   }});
   // The cloud endpoint uses only the declared backend host; no runtime prompt is needed.
   globals.chrome.permissions.request=async()=>{throw new Error('Run must not request an online host permission')};
   globalThis.fetch=async (input,init)=>{
    const body=JSON.parse(String(init?.body));
    globals.fixtureCalls.push({url:String(input),body,authorization:new Headers(init?.headers).get('Authorization')});
    const decision=body.goal.includes('guide')&&!body.text.includes('Public guide fixture')?
     {type:'open_link',link:body.links.indexOf('Guide')}:{type:'finish',answer:body.goal.includes('guide')?'Read the public guide.':'Cloud fixture answer'};
    return new Response(JSON.stringify({decision}),{headers:{'Content-Type':'application/json'}});
   };
  });
  await panel.setViewportSize({width:340,height:900});
  await expect(panel.getByRole('heading',{name:'Task result'})).toBeVisible();
  await expect(panel.getByLabel('Planner origin')).toBeHidden();
  await panel.screenshot({path:testInfo.outputPath('side-panel.png'),fullPage:true});
  await expect(panel.getByLabel('Private planner access token')).toHaveCount(0);
  const command=panel.getByRole('textbox',{name:'Command'});
  await site.bringToFront();
  const submit=()=>panel.evaluate(()=>document.querySelector('form')?.requestSubmit());
  const calls=()=>panel.evaluate(()=>(globalThis as any).fixtureCalls);
  await expect(panel.getByRole('complementary',{name:'Privacy note'})).toContainText('may send your command and visible page excerpts');
  await panel.getByRole('button',{name:'Hide privacy note'}).evaluate((button:HTMLButtonElement)=>button.click());
  await expect(panel.getByRole('complementary',{name:'Privacy note'})).toHaveCount(0);
  await expect(panel.getByLabel('Chrome AI availability')).toHaveCount(0);
  expect(await calls()).toEqual([]);
  await panel.getByRole('button',{name:'Scroll down',exact:true}).evaluate((button:HTMLButtonElement)=>button.click());
  await expect(command).toHaveValue('Scroll down');
  await expect(panel.getByRole('status')).toContainText('idle');
  await submit();
  await expect(panel.getByRole('status')).toContainText('success');
  expect(await calls()).toEqual([]);
  await site.evaluate(()=>window.scrollTo(0,0));
  await command.fill('Tell me about the visible fixture.');
  expect(await calls()).toEqual([]);
  await submit();
  await expect(panel.getByRole('status')).toContainText('Cloud fixture answer');
  await expect(panel.getByRole('button',{name:'Approve and continue'})).toHaveCount(0);
  const requests=await calls();
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe('https://browser-assistant-api-production.up.railway.app/planner/next');
  expect(requests[0].authorization).toBeNull();
  expect(requests[0].body.goal).toBe('Tell me about the visible fixture.');
  expect(JSON.stringify(requests[0].body)).not.toContain('test-only-private-value');
  expect(JSON.stringify(requests[0].body)).not.toContain('Private fixture label');

  await command.fill('Find the guide and read it.');
  await submit();
  await expect(panel.getByRole('region',{name:'Link review'})).toContainText('https://example.com/guide');
  expect(await calls()).toHaveLength(2);
  await expect(site).toHaveURL('https://example.com/');
  await panel.getByRole('button',{name:'Open this link'}).evaluate((button:HTMLButtonElement)=>button.click());
  await expect(site).toHaveURL('https://example.com/guide');
  await expect(panel.getByRole('status')).toContainText('Read the public guide.');
  expect(await calls()).toHaveLength(3);
  await panel.reload();
  await expect(panel.getByRole('status')).toContainText('Read the public guide.');
  await expect(panel.getByRole('complementary',{name:'Privacy note'})).toBeVisible();
 }finally{await context.close();await rm(dir,{recursive:true,force:true})}
});

test('compound site command opens a separate tab, then reads the verified destination',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'assistant-site-'));
 const extension=resolve('apps/extension/.output/chrome-mv3-test');
 const context=await chromium.launchPersistentContext(dir,{channel:'chromium',headless:process.env.PW_HEADLESS==='1',args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  await context.route('https://example.com/**',r=>r.fulfill({contentType:'text/html',body:'<main><h1>Documentation fixture</h1></main>'}));
  const source=await context.newPage();await source.goto('https://example.com/source');
  const panel=await context.newPage();await panel.goto('chrome-extension://'+new URL(worker.url()).host+'/sidepanel.html');
  await panel.evaluate(()=>{
   const globals=globalThis as any;
   const fixtureReady=new Promise<void>(resolve=>{globals.releaseFixture=resolve});
   globals.chrome.permissions.request=async({origins}:{origins:string[]})=>origins.length===1&&origins[0]==='https://example.com/*';
   Object.defineProperty(globalThis,'LanguageModel',{configurable:true,value:{
    availability:async()=>{await fixtureReady;return 'available'},
    create:async()=>({destroy:()=>{},prompt:async(raw:string)=>{
     const {goal,view}=JSON.parse(raw);
     if(goal!=='describe the page'||!view.text.includes('Documentation fixture'))throw new Error('Wrong goal or evidence');
     return '{"type":"finish","answer":"Verified the opened documentation page."}';
    }}),
   }});
  });
  await panel.getByRole('textbox',{name:'Command'}).fill('Open example.com/docs in a new tab, then describe the page');
  await source.bringToFront();
  await panel.evaluate(()=>document.querySelector('form')?.requestSubmit());
  await expect(panel.getByRole('region',{name:'Website access review'})).toContainText('https://example.com/docs');
  const opened=context.waitForEvent('page');
  await panel.getByRole('button',{name:'Open and continue'}).evaluate((button:HTMLButtonElement)=>button.click());
  const destination=await opened;
  await expect(destination).toHaveURL('https://example.com/docs');
  // Chrome API-created tabs can start the initial request before Playwright
  // attaches its route. Load the controlled fixture before releasing inference.
  await destination.route('https://example.com/docs',r=>r.fulfill({contentType:'text/html',body:'<main><h1>Documentation fixture</h1></main>'}));
  await destination.reload();
  await expect(destination.getByRole('heading',{name:'Documentation fixture'})).toBeVisible();
  await panel.evaluate(()=>(globalThis as any).releaseFixture());
  await expect(source).toHaveURL('https://example.com/source');
  await expect(panel.getByRole('status')).toContainText('Verified the opened documentation page.');
 }finally{await context.close();await rm(dir,{recursive:true,force:true})}
});
