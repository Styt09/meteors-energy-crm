import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('public/index.html','utf8');
const match=html.match(/<script>([\\s\\S]*?)<\\/script>/i);
if(!match) throw new Error('No inline application script found');
new vm.Script(match[1],{filename:'public/index.html'});
const worker=readFileSync('worker.js','utf8');
new vm.Script(worker,{filename:'worker.js'});
for(const token of ['setup-status','SESSION_SECRET','hashToken','SameSite']) {
 if(!worker.includes(token) && !html.includes(token)) throw new Error('Missing auth guard: '+token);
}
console.log('UI and Worker JavaScript syntax passed; auth markers present.');
