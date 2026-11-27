import {test,expect,chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';

test('production package prepares a profile draft and leaves submission to the user',async({},info)=>{
 const profile=await mkdtemp(resolve(tmpdir(),'assistant-production-'));
 const extension=resolve('apps/extension/.output/chrome-mv3');
 const browser=await chromium.launchPersistentContext(profile,{channel:'chromium',
  headless:process.env.PW_HEADLESS==='1',args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
 try{
  const worker=browser.serviceWorkers()[0]??await browser.waitForEvent('serviceworker');
  const site=await browser.newPage();
  const url='https://www.google.com/browser-assistant-demo-form';
  let submitted=0;
  // An entirely local fixture at an origin already granted in the production
  // manifest. This does not contact Google or add test-only extension permissions.
  await browser.route('https://www.google.com/browser-assistant-demo-form**',route=>{
   if(route.request().method()!=='GET'){submitted++;return route.fulfill({status:403,body:'Fixture blocks submissions.'})}
   return route.fulfill({contentType:'text/html',body:`<!doctype html><title>Demo application</title>
    <style>body{font:16px system-ui;max-width:580px;margin:48px auto;padding:0 24px;background:#f4f6fb;color:#18253a}
    main{background:white;padding:28px;border:1px solid #d9e0ec;border-radius:16px}
    label,input{display:block} label{margin:12px 0} input{padding:8px;width:95%;border:1px solid #9aa8bd;border-radius:7px;font:inherit}
    button{padding:9px 13px} small{color:#4d5d74}</style>
    <main><small>BROWSER ASSISTANT TEST FIXTURE</small><h1>Demo job application</h1>
    <p>Dummy contact details only. This form cannot submit to a real employer.</p>
    <form action="/browser-assistant-demo-form/submit" method="post">
    <label>Full name <input autocomplete="name"></label>
    <label>Email address <input type="email" autocomplete="email"></label>
    <label>Phone number <input type="tel" autocomplete="tel"></label>
    <label>Expected salary <input></label>
    <button type="submit">Submit application</button></form></main>`});
  });
  await site.goto(url);
  const panel=await browser.newPage();
  await panel.goto('chrome-extension://'+new URL(worker.url()).host+'/sidepanel.html');
  await panel.setViewportSize({width:380,height:960});
  await panel.getByRole('button',{name:'Hide privacy note'}).click();
  // Fail the smoke test if the saved-data workflow makes a planner call.
  await panel.evaluate(()=>{globalThis.fetch=async()=>{throw new Error('Profile drafting must not call a provider')}});
  const saved=panel.getByLabel('Saved details');
  await saved.locator('summary').click();
  await saved.getByRole('textbox',{name:'First name'}).fill('Casey');
  await saved.getByRole('textbox',{name:'Last name'}).fill('Applicant');
  await saved.getByRole('textbox',{name:'Email address'}).fill('casey@example.org');
  await saved.getByRole('textbox',{name:'Phone number'}).fill('+1 555 010 1234');
  await saved.getByRole('button',{name:'Save details'}).click();
  await expect(saved).toContainText('Saved on this device.');
  await panel.reload();
  await panel.evaluate(()=>{globalThis.fetch=async()=>{throw new Error('Profile drafting must not call a provider')}});
  await panel.getByRole('button',{name:'Hide privacy note'}).click();
  await saved.locator('summary').click();
  await expect(saved.getByRole('textbox',{name:'Email address'})).toHaveValue('casey@example.org');
  await site.bringToFront();
  await saved.getByRole('button',{name:'Fill from my profile'}).evaluate((el:HTMLButtonElement)=>el.click());
  await saved.locator('summary').evaluate((el:HTMLElement)=>el.click());
  const draft=panel.getByRole('region',{name:'Form draft'});
  await expect(draft.getByRole('textbox',{name:'Full name'})).toHaveValue('Casey Applicant');
  await expect(site.getByLabel('Full name')).toHaveValue('');
  await expect(site.getByLabel('Email address')).toHaveValue('');
  await draft.getByRole('checkbox',{name:'Skip Phone number'}).check();
  await draft.getByRole('textbox',{name:'Full name'}).fill('Casey A.');
  await panel.screenshot({path:info.outputPath('profile-review.png'),fullPage:true,animations:'disabled'});
  await site.bringToFront();
  await draft.getByRole('button',{name:'Fill these fields'}).evaluate((el:HTMLButtonElement)=>el.click());
  await expect(panel.getByRole('status').first()).toContainText('Filled 2 reviewed fields');
  await expect(site.getByLabel('Full name')).toHaveValue('Casey A.');
  await expect(site.getByLabel('Email address')).toHaveValue('casey@example.org');
  await expect(site.getByLabel('Phone number')).toHaveValue('');
  await expect(site.getByLabel('Expected salary')).toHaveValue('');
  await expect(site.getByRole('button',{name:'Submit application'})).toBeEnabled();
  expect(submitted).toBe(0);
  await site.screenshot({path:info.outputPath('form-left-open.png'),fullPage:true});
 }finally{await browser.close();await rm(profile,{recursive:true,force:true})}
});
