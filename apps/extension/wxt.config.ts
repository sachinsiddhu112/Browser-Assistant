import { defineConfig } from 'wxt';
export default defineConfig({
 modules:['@wxt-dev/module-react'],
 manifest:{name:'Browser Assistant',description:'User-controlled browser assistant',permissions:['activeTab','scripting','storage','sidePanel'],action:{default_title:'Open Browser Assistant'}}
});
