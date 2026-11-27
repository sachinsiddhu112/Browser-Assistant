import { defineConfig } from 'wxt';
import {PLANNER_HOST} from './core/cloud-config';
export default defineConfig({
 modules:['@wxt-dev/module-react'],
 manifest:{version:'0.7.0',name:'Browser Assistant',description:'User-controlled browser assistant',permissions:['activeTab','scripting','storage','sidePanel'],host_permissions:['https://www.youtube.com/*','https://www.google.com/*',PLANNER_HOST],optional_host_permissions:['https://*/*'],action:{default_title:'Open Browser Assistant'}}
});
