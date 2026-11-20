import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('public/index.html', 'utf8');
const match = html.match(/<script>([\\s\\S]*?)<\\/script>/i);
if (!match) throw new Error('No inline application script found');
new vm.Script(match[1], { filename: 'public/index.html' });

const worker = readFileSync('src/index.ts', 'utf8');
for (const required of [
  'SESSION_SECRET', 'hashToken', 'setup-status',
  "app.post('/api/auth/login'", "app.post('/api/auth/register'",
  'DB.batch', 'httpOnly:true', "sameSite:'Lax'"
]) {
  if (!worker.includes(required)) throw new Error('Missing expected auth code: ' + required);
}
console.log('CRM UI JavaScript syntax and auth source checks passed.');
