import {test,expect,chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
test('extension mock lifecycle and cancellation',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'assistant-'));
 const extension=resolve('apps/extension/.output/chrome-mv3-test');
 const context=await chromium.launchPersistentContext(dir,{channel:'chromium',headless:false,args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  const site=await context.newPage();
  await site.route('https://example.com/**',route=>route.fulfill({contentType:'text/html',body:'<html><body><h1>Fixture</h1></body></html>'}));
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
  expect((await send('START',{command:'test preview'})).ok).toBe(true);
  await expect.poll(async()=> (await send('GET_STATE')).session?.phase).toBe('success');
  expect((await send('START',{command:'cancel preview'})).ok).toBe(true);
  expect((await send('STOP')).session?.phase).toBe('cancelled');
  await new Promise(r=>setTimeout(r,1500));
  expect((await send('GET_STATE')).session?.phase).toBe('cancelled');
  await panel.reload();
  await expect(panel.getByRole('status')).toContainText('cancelled');
 }finally{await context.close();await rm(dir,{recursive:true,force:true})}
});
