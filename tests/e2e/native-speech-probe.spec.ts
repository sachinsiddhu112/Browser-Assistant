import {test,expect,chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';

test('probe the production build against Chromium native speech capabilities',async({},info)=>{
 const dir=await mkdtemp(resolve(tmpdir(),'assistant-native-speech-'));
 const extension=resolve('apps/extension/.output/chrome-mv3');
 const fixture=process.env.NATIVE_SPEECH_FIXTURE;
 const context=await chromium.launchPersistentContext(dir,{channel:'chromium',headless:process.env.PW_HEADLESS==='1',
  ignoreDefaultArgs:['--disable-component-update','--disable-background-networking'],
  args:['--disable-extensions-except='+extension,'--load-extension='+extension,...(fixture?['--enable-speech-dispatcher','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-audio-capture='+fixture+'%noloop']:[])]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  const site=await context.newPage();
  await site.route('https://www.google.com/browser-assistant-speech-test',r=>r.fulfill({contentType:'text/html',body:'<main style="height:3600px">Local scroll fixture</main>'}));
  await site.goto('https://www.google.com/browser-assistant-speech-test');
  const panel=await context.newPage();
  await panel.goto('chrome-extension://'+new URL(worker.url()).host+'/sidepanel.html');
  await panel.setViewportSize({width:410,height:890});
  const infoBefore=await panel.evaluate(async()=>{
   const world=globalThis as any;
   const api=[world.SpeechRecognition,world.webkitSpeechRecognition].find(api=>typeof api?.available==='function');
   const get=()=>speechSynthesis.getVoices().map(v=>({lang:v.lang,local:v.localService}));
   let voices=get();
   if(!voices.length){await Promise.race([new Promise(r=>speechSynthesis.addEventListener('voiceschanged',r,{once:true})),new Promise(r=>setTimeout(r,2000))]);voices=get()}
   let pack='no-native-availability';
   if(api)try{pack=await Promise.race([api.available({langs:['en-US'],processLocally:true}),new Promise(r=>setTimeout(()=>r('timed-out'),2500))])}
   catch(e){pack=e instanceof Error?e.name:'error'}
   return {nativeRecognizer:!!(world.SpeechRecognition??world.webkitSpeechRecognition),pack,install:typeof api?.install,voices,
    version:world.chrome.runtime.getManifest().version,browser:navigator.userAgent};
  });
  console.log('NATIVE BEFORE '+JSON.stringify(infoBefore));
  const mic=panel.getByRole('button',{name:'Dictate locally (English)'});
  await mic.click();
  const dictation=panel.getByRole('status',{name:'Dictation status'});
  const setup=panel.getByRole('button',{name:'Download English speech pack'});
  const dictationStatus=async()=>await dictation.count()?await dictation.innerText():await panel.locator('.error').allTextContents();
  await expect.poll(async()=>[await dictation.count(),await panel.locator('.error').count(),await panel.getByRole('button',{name:'Stop listening'}).count()].some(Boolean)).toBe(true);
  console.log('NATIVE DICTATION '+JSON.stringify({status:await dictationStatus(),offered:await setup.count()}));
  if(await setup.count()){
   await setup.click();
   await expect.poll(async()=>await dictation.innerText(),{timeout:15_000}).not.toContain('The microphone is off.').catch(()=>{});
   console.log('NATIVE SETUP '+JSON.stringify(await dictationStatus()));
  }else if(await panel.getByRole('button',{name:'Stop listening'}).count()){
   await panel.getByRole('button',{name:'Stop listening'}).click();
  }
  await panel.screenshot({path:info.outputPath('native-dictation.png'),fullPage:true});
  if(fixture&&/pack ready/.test(String(await dictationStatus()))){
   await mic.click();
   await expect.poll(async()=>{const value=await panel.getByRole('textbox',{name:'Command'}).inputValue();return value||((await panel.locator('.error').allTextContents()).join(' '))},{timeout:12_000}).not.toBe('').catch(()=>{});
   console.log('REAL TRANSCRIPT '+JSON.stringify({text:await panel.getByRole('textbox',{name:'Command'}).inputValue(),status:await dictationStatus()}));
   if(await panel.getByRole('button',{name:'Stop listening'}).count())await panel.getByRole('button',{name:'Stop listening'}).click();
  }
  const toggle=panel.getByRole('button',{name:'Speak results',exact:true});
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed','true');
  await panel.reload();
  await expect(toggle).toHaveAttribute('aria-pressed','true');
  await panel.evaluate(()=>{
   const g=globalThis as any;
   g.nativeVoiceEvents=[];
   const nativeSpeak=speechSynthesis.speak.bind(speechSynthesis);
   speechSynthesis.speak=utterance=>{
    for(const name of ['start','end','error'])utterance.addEventListener(name,event=>g.nativeVoiceEvents.push({name,error:'error' in event?event.error:undefined}));
    nativeSpeak(utterance);
   };
  });
  await panel.getByRole('textbox',{name:'Command'}).fill('Scroll down');
  await site.bringToFront();
  await panel.evaluate(()=>document.querySelector('form')?.requestSubmit());
  await expect(panel.locator('.result-message')).toHaveText('Page scrolled');
  const localVoices=infoBefore.voices.filter(v=>v.local).length;
  if(!localVoices)await expect(panel.getByText('No on-device voice is available. You can still read the result.')).toBeVisible();
  if(fixture&&localVoices)await expect.poll(()=>panel.evaluate(()=>(globalThis as any).nativeVoiceEvents.length),{timeout:10000}).toBeGreaterThan(0).catch(()=>{});
  console.log('REAL SYNTHESIS '+JSON.stringify(await panel.evaluate(()=>(globalThis as any).nativeVoiceEvents)));
  console.log('NATIVE TTS '+JSON.stringify({enabled:await toggle.getAttribute('aria-pressed'),
   localVoices,speaking:await panel.evaluate(()=>speechSynthesis.speaking),visibleStatus:await panel.locator('.helper').allTextContents()}));
  await panel.screenshot({path:info.outputPath('native-speak-results.png'),fullPage:true});
  await toggle.evaluate((btn:HTMLButtonElement)=>btn.click());
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  await panel.reload();
  await expect(toggle).toHaveAttribute('aria-pressed','false');
 }finally{await context.close();await rm(dir,{recursive:true,force:true})}
});
