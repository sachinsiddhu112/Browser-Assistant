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
  expect((await send('START',{command:'Scroll down'})).ok).toBe(true);
  await expect.poll(async()=> (await send('GET_STATE')).session?.phase).toBe('success');
  await expect.poll(()=>site.evaluate(()=>scrollY)).toBeGreaterThan(0);
  expect((await send('START',{command:'Inspect page'})).ok).toBe(true);
  await expect.poll(async()=> (await send('GET_STATE')).session?.message).toContain('Observed 1 interactive elements');
  expect((await send('START',{command:'Type NestJS into search'})).ok).toBe(true);
  await expect.poll(async()=> (await send('GET_STATE')).session?.phase).toBe('success');
  await expect(site.getByRole('searchbox')).toHaveValue('NestJS');
  await expect(site.locator('input[type=password]')).toHaveValue('');
  await site.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:'<html><body><h1>YouTube fixture</h1></body></html>'}));
  expect((await send('START',{command:'Open YouTube'})).ok).toBe(true);
  await expect.poll(async()=> (await send('GET_STATE')).session?.phase).toBe('success');
  await expect(site).toHaveURL('https://www.youtube.com/');
  expect((await send('START',{command:'Go back'})).ok).toBe(true);
  await expect.poll(async()=> (await send('GET_STATE')).session?.phase).toBe('success');
  await expect(site).toHaveURL('https://example.com/');
  await site.route('https://www.youtube.com/results?*',route=>route.fulfill({contentType:'text/html',body:`<html><body>
   <ytd-video-renderer><a id="video-title" href="/watch?v=abcdefghijk">First song</a></ytd-video-renderer>
   <ytd-video-renderer><a id="video-title" href="/watch?v=lmnopqrstuv">Second song</a></ytd-video-renderer>
   <ytd-video-renderer hidden><a id="video-title" href="/watch?v=zyxwvutsrqp">Hidden song</a></ytd-video-renderer>
   <ytd-video-renderer><a id="video-title" href="https://attacker.invalid/watch?v=zyxwvutsrqp">Off-site song</a></ytd-video-renderer>
  </body></html>`}));
  await site.route('https://www.youtube.com/watch?*',route=>route.fulfill({contentType:'text/html',body:'<html><body><h1>Video fixture</h1></body></html>'}));
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
  await site.route('https://example.com/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><main>
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
   Object.defineProperty(globalThis,'LanguageModel',{configurable:true,value:{
    availability:async()=> 'available',
    create:async()=>({
     prompt:async (input:string)=>{
      const {goal,view,previousSteps}=JSON.parse(input);
      if(input.includes('fixture-only-never-read')||view.fields.includes('Password'))throw new Error('Sensitive field leaked');
      if(goal.includes('details')){
       if(view.links.includes('Off-site details'))throw new Error('Unexpected off-site link');
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

  await run('Could you open the role details?');
  await expect(panel.getByRole('region',{name:'Link review'})).toContainText('https://example.com/details');
  await expect(site).toHaveURL('https://example.com/');
  await decide('Open this link');
  await expect(site).toHaveURL('https://example.com/details');
  await expect(panel.getByRole('status')).toContainText('Opened the reviewed link');

 }finally{await context.close();await rm(dir,{recursive:true,force:true})}
});

test('one Run task button routes to cloud only after review',async({},testInfo)=>{
 const dir=await mkdtemp(resolve(tmpdir(),'assistant-fallback-'));
 const extension=resolve('apps/extension/.output/chrome-mv3-test');
 const context=await chromium.launchPersistentContext(dir,{channel:'chromium',headless:process.env.PW_HEADLESS==='1',args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  const site=await context.newPage();
  await site.route('https://example.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><main style="height:4500px"><h1>Public fixture</h1><label>Private fixture label <input value="test-only-private-value"></label></main>'}));
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
   // Stub Chrome's host prompt and the private backend. No real page data or token leaves the fixture.
   globals.chrome.permissions.request=async()=>true;
   globalThis.fetch=async (input,init)=>{
    globals.fixtureCalls.push({url:String(input),body:JSON.parse(String(init?.body))});
    return new Response(JSON.stringify({decision:{type:'finish',answer:'Cloud fixture answer'}}),{headers:{'Content-Type':'application/json'}});
   };
  });
  await panel.setViewportSize({width:340,height:900});
  await expect(panel.getByRole('heading',{name:'Task result'})).toBeVisible();
  await expect(panel.getByLabel('Planner origin')).toBeHidden();
  await panel.screenshot({path:testInfo.outputPath('side-panel.png'),fullPage:true});
  await panel.getByText('Cloud planner settings').click();
  await panel.getByText('Advanced connection settings').click();
  await expect(panel.getByLabel('Planner origin')).toHaveValue('https://browser-assistant-api-production.up.railway.app');
  await panel.getByLabel('Planner origin').fill('https://planner.example.net');
  await panel.getByLabel('Private planner access token').fill('fixture_only_token_000000000000000');
  const command=panel.getByRole('textbox',{name:'Command'});
  await site.bringToFront();
  const submit=()=>panel.evaluate(()=>document.querySelector('form')?.requestSubmit());
  const calls=()=>panel.evaluate(()=>(globalThis as any).fixtureCalls);
  const review=panel.getByRole('region',{name:'Cloud sharing review'});
  await panel.getByRole('button',{name:'Scroll down',exact:true}).evaluate((button:HTMLButtonElement)=>button.click());
  await expect(command).toHaveValue('Scroll down');
  await expect(panel.getByRole('status')).toContainText('idle');
  await submit();
  await expect(panel.getByRole('status')).toContainText('success');
  await expect(review).toHaveCount(0);
  expect(await calls()).toEqual([]);
  await site.evaluate(()=>window.scrollTo(0,0));
  await command.fill('What is the heading on this page?');
  await submit();
  await expect(review).toContainText('https://example.com');
  expect(await calls()).toEqual([]);
  await command.fill('Tell me about the visible fixture.');
  await expect(review).toHaveCount(0);
  await submit();
  await expect(panel.getByLabel('Chrome AI availability')).toContainText('model not ready yet');
  await expect(panel.getByRole('button',{name:'Approve and continue'})).toBeVisible();
  expect(await calls()).toEqual([]);
  await submit();
  expect(await calls()).toEqual([]); // Implicit submission must not approve sharing.
  await panel.getByRole('button',{name:'Approve and continue'}).evaluate((button:HTMLButtonElement)=>button.click());
  await expect(panel.getByRole('status')).toContainText('Cloud fixture answer');
  const requests=await calls();
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe('https://planner.example.net/planner/next');
  expect(requests[0].body.goal).toBe('Tell me about the visible fixture.');
  expect(JSON.stringify(requests[0].body)).not.toContain('test-only-private-value');
  expect(JSON.stringify(requests[0].body)).not.toContain('Private fixture label');
  // Approval is not reused on the next task.
  await submit();
  await expect(review).toBeVisible();
  expect(await calls()).toHaveLength(1);
  await site.reload();
  await expect(review).toHaveCount(0);
 }finally{await context.close();await rm(dir,{recursive:true,force:true})}
});
