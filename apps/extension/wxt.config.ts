import { defineConfig } from 'wxt';
export default defineConfig({
 modules:['@wxt-dev/module-react'],
 manifest:{version:'0.5.0',name:'Browser Assistant',description:'User-controlled browser assistant',permissions:['activeTab','scripting','storage','sidePanel'],host_permissions:['https://www.youtube.com/*','https://www.google.com/*'],optional_host_permissions:['https://*/*','http://localhost/*'],action:{default_title:'Open Browser Assistant'}}
});
