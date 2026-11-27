import { defineConfig } from 'wxt';
import {PLANNER_HOST} from './core/cloud-config';
export default defineConfig({
 modules:['@wxt-dev/module-react'],
 manifest:{version:'0.5.1',name:'Browser Assistant',description:'User-controlled browser assistant',permissions:['activeTab','scripting','storage','sidePanel'],host_permissions:['https://www.youtube.com/*','https://www.google.com/*'],optional_host_permissions:['https://*/*',PLANNER_HOST],action:{default_title:'Open Browser Assistant'}}
});
