import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
function App(){
 const [status,setStatus]=useState('Ready');
 async function show(){
  try{
   const [tab]=await browser.tabs.query({active:true,currentWindow:true});
   if(tab?.id===undefined) throw new Error('No active tab');
   await browser.scripting.executeScript({target:{tabId:tab.id},files:['overlay.js']});
   setStatus('Assistant displayed');
  }catch{setStatus('Cannot access this page. Open a regular website and click the extension icon first.');}
 }
 return <main><h1>Browser Assistant</h1><p>Foundation preview</p><button onClick={show}>Show assistant on page</button><p role="status">{status}</p><small>AI and voice execution are not enabled yet.</small></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
