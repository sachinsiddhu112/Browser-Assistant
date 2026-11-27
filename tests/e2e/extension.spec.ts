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
  await panel.getByRole('textbox',{name:'Command'}).fill('open youtub in new tab using youtube.com');
  await site.bringToFront();
  const newTab=context.waitForEvent('page');
  await panel.evaluate(()=>document.querySelector('form')?.requestSubmit());
  const opened=await newTab;
  await expect(opened).toHaveURL('https://www.youtube.com/');
  await expect(site).toHaveURL('https://www.youtube.com/results?search_query=Example');
  await expect(panel.getByRole('status')).toContainText('Opened YouTube in a new tab');
  await opened.close();
  await panel.evaluate(()=>{
   Object.defineProperty(globalThis,'LanguageModel',{configurable:true,value:{
    availability:async()=> 'available',
    create:async()=>({destroy:()=>{},prompt:async(input:string)=>{
     const body=JSON.parse(input);
     if(body.goal.startsWith('Move me farther down')&&!body.view)return '{"intent":"scroll_down"}';
     if(body.goal.startsWith('Could you pop')&&!body.view)return '{"intent":"youtube_tab"}';
     if(body.goal.startsWith('Does this page')&&!body.view)return '{"intent":"guided"}';
     if(body.goal.startsWith('Does this page')&&body.view)return '{"type":"ask","question":"No matching link in the viewed page."}';
     throw new Error('Unexpected planner input');
    }}),
   }});
  });
  const run=async(command:string)=>{
   await panel.getByRole('textbox',{name:'Command'}).fill(command);
   await site.bringToFront();
   await panel.evaluate(()=>document.querySelector('form')?.requestSubmit());
  };
  await site.goto('https://example.com/');
  await run('Move me farther down this page');
  await expect(panel.getByRole('status')).toContainText('Page scrolled');
  expect(await site.evaluate(()=>scrollY)).toBeGreaterThan(0);
  const originalTabCount=context.pages().length;
  await run('Does this page contain a link to YouTube?');
  await expect(panel.getByRole('status')).toContainText('needs-input');
  expect(context.pages()).toHaveLength(originalTabCount);
  const semantic=context.waitForEvent('page');
  await run('Could you pop YouTube into its own tab?');
  await expect(await semantic).toHaveURL('https://www.youtube.com/');
  await expect(site).toHaveURL('https://example.com/');
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
      if(!view)return JSON.stringify({intent:'guided'});
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
  await expect(panel.getByRole('region',{name:'Form draft'}).getByRole('textbox',{name:'Full name'})).toHaveValue('Sachin');
  await expect(site.getByRole('textbox',{name:'Full name'})).toHaveValue('');
  await expect(site.getByLabel('Password')).toHaveValue('fixture-only-never-read');
  const decide=async(label:string)=>{
   await site.bringToFront();
   await panel.getByRole('button',{name:label,exact:true}).evaluate((button:HTMLButtonElement)=>button.click());
  };
  await panel.getByRole('region',{name:'Form draft'}).getByRole('textbox',{name:'Full name'}).fill('Sachin Siddhu');
  await expect(site.getByRole('textbox',{name:'Full name'})).toHaveValue('');
  await decide('Fill these fields');
  await expect(site.getByRole('textbox',{name:'Full name'})).toHaveValue('Sachin Siddhu');
  await expect(panel.getByRole('status')).toContainText('Filled 1 reviewed fields');
  await site.getByRole('textbox',{name:'Full name'}).fill('');

  await run('Could you draft my name as Sachin?');
  await expect(panel.getByRole('region',{name:'Form draft'}).getByRole('textbox',{name:'Full name'})).toHaveValue('Sachin');
  await site.getByRole('textbox',{name:'Full name'}).evaluate(e=>e.replaceWith(e.cloneNode()));
  await decide('Fill these fields');
  await expect(panel.getByRole('status')).toContainText('Verified 0 of 1 fields');
  await expect(site.getByRole('textbox',{name:'Full name'})).toHaveValue('');

  await run('Fill "Full name" with "Sachin"');
  await expect(panel.getByRole('region',{name:'Form draft'}).getByRole('textbox',{name:'Full name'})).toHaveValue('Sachin');
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
    if(body.mode==='intent'){
     if(body.text||body.links)throw new Error('Intent routing must not read the page');
     return new Response(JSON.stringify({decision:{intent:body.goal.includes('pop YouTube')?'youtube_tab':'guided'}}));
    }
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
  await expect(panel.getByRole('status')).toContainText('answered');
  await expect(panel.getByRole('button',{name:'Approve and continue'})).toHaveCount(0);
  const requests=await calls();
  expect(requests).toHaveLength(2);
  expect(requests[0].body).toEqual({mode:'intent',goal:'Tell me about the visible fixture.',sites:[]});
  expect(requests[0].url).toBe('https://browser-assistant-api-production.up.railway.app/planner/next');
  expect(requests[0].authorization).toBeNull();
  expect(requests[0].body.goal).toBe('Tell me about the visible fixture.');
  expect(JSON.stringify(requests[0].body)).not.toContain('test-only-private-value');
  expect(JSON.stringify(requests[0].body)).not.toContain('Private fixture label');

  await command.fill('Find the guide and read it.');
  await submit();
  await expect(panel.getByRole('region',{name:'Link review'})).toContainText('https://example.com/guide');
  expect(await calls()).toHaveLength(4);
  await expect(site).toHaveURL('https://example.com/');
  await panel.getByRole('button',{name:'Open this link'}).evaluate((button:HTMLButtonElement)=>button.click());
  await expect(site).toHaveURL('https://example.com/guide');
  await expect(panel.getByRole('status')).toContainText('Read the public guide.');
  expect(await calls()).toHaveLength(5);
  await panel.reload();
  await expect(panel.getByRole('status')).toContainText('Read the public guide.');
  await expect(panel.getByRole('complementary',{name:'Privacy note'})).toBeVisible();
  await context.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>YouTube fixture</h1>'}));
  // Reload removed the mocked provider; use a fresh stub for command-only routing.
  await panel.evaluate(()=>{
   Object.defineProperty(globalThis,'LanguageModel',{configurable:true,value:{availability:async()=> 'unavailable'}});
   globalThis.fetch=async(_input,init)=>{
    const body=JSON.parse(String(init?.body));
    if(body.mode!=='intent'||Object.keys(body).length!==3||body.goal!=='Please pop YouTube into its own tab')throw new Error('Expected minimized command-only request');
    return new Response('{"decision":{"intent":"youtube_tab"}}');
   };
  });
  await command.fill('Please pop YouTube into its own tab');
  await site.bringToFront();
  const newTab=context.waitForEvent('page');
  await submit();
  await expect(await newTab).toHaveURL('https://www.youtube.com/');
  await expect(site).toHaveURL('https://example.com/guide');
  await expect(panel.getByRole('status')).toContainText('Opened YouTube in a new tab');

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

test('research selects two sites, compares verified evidence and speaks the result on demand',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'assistant-research-'));
 const extension=resolve('apps/extension/.output/chrome-mv3-test');
 const context=await chromium.launchPersistentContext(dir,{channel:'chromium',headless:process.env.PW_HEADLESS==='1',args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  await context.route('https://www.google.com/search?*',r=>r.fulfill({contentType:'text/html',body:
   '<main><a href="https://example.com/framework"><h3>Framework one</h3></a><a href="https://example.org/framework"><h3>Framework two</h3></a><a href="https://example.net/private"><h3>Unselected result</h3></a></main>'}));
  await context.route(/https:\/\/example\.(com|org)\/.*/,r=>{
   const first=new URL(r.request().url()).hostname==='example.com';
   const heading=first?'Framework one validation':'Framework two validation';
   return r.fulfill({contentType:'text/html',body:'<title>'+heading+'</title><main><h1>'+heading+'</h1><table><tr><th>Defaults</th><td>'+(first?'Schema A':'Schema B')+'</td></tr></table><form><label>Private field<input value="secret-fixture-only"></label></form></main>'});
  });
  // Allow deterministic fixture interception for tabs created by the Chrome API.
  context.on('page',p=>void p.waitForLoadState('domcontentloaded').catch(()=>{}));
  const source=await context.newPage();await source.goto('https://example.com/');
  const panel=await context.newPage();await panel.goto('chrome-extension://'+new URL(worker.url()).host+'/sidepanel.html');
  await panel.evaluate(()=>{
   const globals=globalThis as any;
   globals.fixture={spoken:[],requests:[],grants:[],cancelled:0};
   Object.defineProperty(globalThis,'LanguageModel',{configurable:true,value:{availability:async()=> 'unavailable'}});
   globals.chrome.permissions.request=async({origins}:{origins:string[]})=>{globals.fixture.grants.push(origins);return true};
   Object.defineProperty(globalThis,'SpeechSynthesisUtterance',{configurable:true,value:class{
    voice:unknown;lang='';constructor(public text:string){}
   }});
   Object.defineProperty(globalThis,'speechSynthesis',{configurable:true,value:{
    addEventListener:()=>{},removeEventListener:()=>{},
    getVoices:()=>[{localService:true,lang:'en-US',name:'Local test voice'}],
    speak:(u:{text:string})=>globals.fixture.spoken.push(u.text),
    cancel:()=>globals.fixture.cancelled++,
   }});
   globalThis.fetch=async (_input,init)=>{
    const body=JSON.parse(String(init?.body));globals.fixture.requests.push(body);
    if(body.mode==='intent'){
     if(body.goal!=='Could you look up the differences in request validation in two frameworks?'||body.text)throw new Error('Expected command-only intent');
     return new Response('{"decision":{"intent":"compare","args":["request validation in two frameworks"]}}');
    }
    if(!body.text.includes('Source 1: Defaults | Schema A')||!body.text.includes('Source 2: Defaults | Schema B'))throw new Error('Missing evidence from both sites');
    return new Response(JSON.stringify({decision:{type:'finish',answer:'Source 1 uses Schema A. Source 2 uses Schema B.'}}));
   };
  });
  const get=()=>panel.evaluate(()=>(globalThis as any).fixture);
  await expect(panel.getByRole('button',{name:'Speak results'})).toHaveAttribute('aria-pressed','false');
  await panel.getByRole('button',{name:'Speak results'}).evaluate((button:HTMLButtonElement)=>button.click());
  await expect(panel.getByRole('button',{name:'Speak results'})).toHaveAttribute('aria-pressed','true');
  await panel.getByRole('textbox',{name:'Command'}).fill('Could you look up the differences in request validation in two frameworks?');
  await source.bringToFront();
  await panel.evaluate(()=>document.querySelector('form')?.requestSubmit());
  const review=panel.getByRole('region',{name:'Research sources'});
  await expect(review).toContainText('Framework one');
  expect((await get()).requests).toHaveLength(1);
  await review.getByRole('checkbox').nth(0).check();
  await review.getByRole('checkbox').nth(1).check();
  await review.getByRole('button',{name:'Open and read selected sources'}).click();
  const result=panel.getByRole('region',{name:'Research result'});
  await expect(result).toContainText('Source 1 uses Schema A.');
  await expect(result.getByRole('link')).toHaveCount(2);
  await expect(result.getByRole('link').first()).toHaveAttribute('href','https://example.com/framework');
  await expect(result.getByRole('link').last()).toHaveAttribute('href','https://example.org/framework');
  expect(context.pages().map(page=>page.url())).toEqual(expect.arrayContaining(['https://example.com/framework','https://example.org/framework']));
  expect(context.pages().map(page=>page.url())).not.toContain('https://example.net/private');
  await expect.poll(async()=>(await get()).spoken).toEqual(['Source 1 uses Schema A. Source 2 uses Schema B.']);
  const recorded=await get();
  expect(recorded.grants).toEqual([['https://example.com/*','https://example.org/*']]);
  expect(JSON.stringify(recorded.requests)).not.toContain('secret-fixture-only');
  await panel.getByRole('button',{name:'Speak results'}).click();
  await expect(panel.getByRole('button',{name:'Speak results'})).toHaveAttribute('aria-pressed','false');
  expect((await get()).cancelled).toBe(1);
 }finally{await context.close();await rm(dir,{recursive:true,force:true})}
});

test('application finder follows a reviewed link and only fills approved saved details',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'assistant-application-'));
 const extension=resolve('apps/extension/.output/chrome-mv3-test');
 const context=await chromium.launchPersistentContext(dir,{channel:'chromium',headless:process.env.PW_HEADLESS==='1',args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  await context.route('https://www.google.com/search?*',r=>r.fulfill({contentType:'text/html',body:'<main><a href="https://example.com/careers/backend"><h3>Acme Backend Engineer posting</h3></a></main>'}));
  await context.route('https://example.com/**',r=>r.fulfill({contentType:'text/html',body:r.request().url().endsWith('/careers/backend')
   ?'<main><h1>Backend Engineer</h1><p>Acme · Noida</p><a href="https://example.org/forms/backend">Apply now</a></main>'
   :'<main><h1>Start page</h1></main>'}));
  await context.route('https://example.org/forms/backend',r=>r.fulfill({contentType:'text/html',body:
   '<main><h1>Apply for Backend Engineer</h1><form action="/submit" method="post" onsubmit="document.body.dataset.submitted=1; return false"><label>Full name <input autocomplete="name"></label><label>Email address <input type="email" autocomplete="email"></label><label>Phone number <input type="tel" autocomplete="tel"></label><label>Current salary <input></label><button type="submit">Submit application</button></form></main>'}));
  const source=await context.newPage();await source.goto('https://example.com/');
  const panel=await context.newPage();await panel.goto('chrome-extension://'+new URL(worker.url()).host+'/sidepanel.html');
  await panel.evaluate(()=>{
   (globalThis as any).fixtureAccess=[];
   (globalThis as any).chrome.permissions.request=async({origins}:{origins:string[]})=>{(globalThis as any).fixtureAccess.push(origins);return true};
   globalThis.fetch=async()=>{throw new Error('Job preparation must not call the planner or send profile values.')};
  });
  const settings=panel.getByLabel('Saved details');
  await settings.locator('summary').click();
  await settings.getByRole('textbox',{name:'First name'}).fill('Casey');
  await settings.getByRole('textbox',{name:'Last name'}).fill('Applicant');
  await settings.getByRole('textbox',{name:'Email address'}).fill('casey@example.org');
  await settings.getByRole('textbox',{name:'Phone number'}).fill('+1 555 010 1234');
  await settings.getByRole('button',{name:'Save details'}).click();
  await expect(settings).toContainText('Saved on this device.');
  await settings.locator('summary').click();
  await panel.getByRole('textbox',{name:'Command'}).fill('Apply for the Backend Engineer role at Acme in Noida using my saved profile');
  await source.bringToFront();
  await panel.evaluate(()=>document.querySelector('form')?.requestSubmit());
  const job=panel.getByRole('region',{name:'Job application'});
  await job.getByRole('button',{name:/Acme Backend Engineer posting/}).click();
  await job.getByRole('button',{name:/Apply now/}).click();
  const draft=panel.getByRole('region',{name:'Form draft'});
  await expect(draft.getByRole('textbox',{name:'Full name'})).toHaveValue('Casey Applicant');
  await expect(draft.getByRole('textbox',{name:'Email address'})).toHaveValue('casey@example.org');
  await expect(draft.getByRole('textbox',{name:'Current salary'})).toHaveCount(0);
  const form=context.pages().find(p=>p.url()==='https://example.org/forms/backend')!;
  await expect(form.getByLabel('Full name')).toHaveValue('');
  await draft.getByRole('checkbox',{name:'Skip Phone number'}).check();
  await draft.getByRole('textbox',{name:'Full name'}).fill('Casey A.');
  await form.bringToFront();
  await draft.getByRole('button',{name:'Fill these fields'}).evaluate((b:HTMLButtonElement)=>b.click());
  await expect(form.getByLabel('Full name')).toHaveValue('Casey A.');
  await expect(form.getByLabel('Email address')).toHaveValue('casey@example.org');
  await expect(form.getByLabel('Phone number')).toHaveValue('');
  await expect(form.getByLabel('Current salary')).toHaveValue('');
  expect(await form.locator('body').getAttribute('data-submitted')).toBeNull();
  expect(await panel.evaluate(()=>(globalThis as any).fixtureAccess)).toEqual([['https://example.com/*'],['https://example.org/*']]);
  await settings.locator('summary').click();
  await expect(settings.getByRole('textbox',{name:'Email address'})).toHaveValue('casey@example.org');
  await settings.getByRole('button',{name:'Delete saved details'}).click();
  await expect(settings).toContainText('Saved details deleted.');
  await expect(settings.getByRole('textbox',{name:'Email address'})).toHaveValue('');
 }finally{await context.close();await rm(dir,{recursive:true,force:true})}
});

test('YouTube uses verified results after a URL rewrite and attempts only selected playback', async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'assistant-media-'));
 const extension=resolve('apps/extension/.output/chrome-mv3-test');
 const context=await chromium.launchPersistentContext(dir,{channel:'chromium',headless:process.env.PW_HEADLESS==='1',args:['--disable-extensions-except='+extension,'--load-extension='+extension,'--autoplay-policy=no-user-gesture-required']});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  const song='Casa Tupka Honey Singh';
  const video='abcdefghijk';
  const target='https://www.youtube.com/results?search_query=Casa+Tupka+Honey+Singh&sp=fixture';
  let watchLoads=0;
  // A real 3-second WAV in the Chromium fixture (never fetch real media).
  const wav=Buffer.alloc(44+24_000*2);
  wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
  wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
  for(let n=0;n<24_000;n++)wav.writeInt16LE(Math.round(80*Math.sin(n*0.3456)),44+n*2);
  await context.route('https://www.youtube.com/**',route=>{
   const u=new URL(route.request().url());
   if(u.pathname==='/results'&&u.searchParams.get('search_query')===song){
    if(!u.searchParams.has('sp'))return route.fulfill({status:302,headers:{location:target}});
    return route.fulfill({contentType:'text/html',body:`<main>
      <ytd-ad-slot-renderer><a href="/watch?v=zzzzzzzzzzz">Promoted video</a></ytd-ad-slot-renderer>
      <yt-lockup-view-model><a href="/watch?v=${video}&pp=fixture" title="Casa Tupka – Honey Singh">Casa Tupka – Honey Singh</a></yt-lockup-view-model>
      <yt-lockup-view-model><a href="https://example.org/watch?v=lmnopqrstuv">External video</a></yt-lockup-view-model>
      <yt-lockup-view-model hidden><a href="/watch?v=zyxwvutsrqp">Hidden video</a></yt-lockup-view-model>
    </main>`});
   }
   if(u.pathname==='/watch'){
    watchLoads++;
    return route.fulfill({contentType:'text/html',body:`<!doctype html><main id="movie_player"><video controls class="html5-main-video" src="/fixture.wav"></video></main>
     <script>document.querySelector('video').addEventListener('play',()=>{document.body.dataset.plays=1+(+document.body.dataset.plays||0)});</script>`});
   }
   if(u.pathname==='/fixture.wav')return route.fulfill({contentType:'audio/wav',body:wav});
   return route.fulfill({contentType:'text/html',body:'<h1>Start fixture</h1>'});
  });
  const site=await context.newPage();await site.goto('https://www.youtube.com/');
  const panel=await context.newPage();await panel.goto('chrome-extension://'+new URL(worker.url()).host+'/sidepanel.html');
  const input=panel.getByRole('textbox',{name:'Command'});
  await input.fill('Play '+song+' on YouTube');
  await site.bringToFront();
  await panel.evaluate(()=>document.querySelector('form')?.requestSubmit());
  const choices=panel.getByRole('region',{name:'YouTube choices'});
  await expect(choices.getByRole('button')).toHaveCount(1);
  await expect(site).toHaveURL(target);
  expect(watchLoads).toBe(0);
  await choices.getByRole('button',{name:'Casa Tupka – Honey Singh'}).evaluate((el:HTMLButtonElement)=>el.click());
  await expect(panel.getByRole('status')).toContainText('Selected YouTube video is playing');
  await expect(site).toHaveURL('https://www.youtube.com/watch?v='+video);
  await expect(site.locator('body')).toHaveAttribute('data-plays','1');
  expect(watchLoads).toBe(1);

  await input.fill('Play No fixture match on YouTube');
  await site.bringToFront();
  await panel.evaluate(()=>document.querySelector('form')?.requestSubmit());
  await expect(panel.getByRole('status')).toContainText('could not find a playable result',{timeout:22_000});
  await expect(panel.getByRole('status')).toContainText('needs-input');
  expect(watchLoads).toBe(1);
 }finally{await context.close();await rm(dir,{recursive:true,force:true})}
});
