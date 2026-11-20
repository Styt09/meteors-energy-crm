import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context } from 'hono';

type Role = 'admin'|'manager'|'salesperson'|'accountant'|'installer'|'customer';
type Env = { DB:D1Database; DOC_INDEX:KVNamespace; ASSETS:Fetcher; APP_NAME:string; ENVIRONMENT:string; SESSION_SECRET:string; ALLOWED_ORIGINS?:string; HOSTINGER_UPLOAD_URL?:string; HOSTINGER_TOKEN?:string };
type Vars = { user:{id:string;name:string;email:string;role:Role;customer_id?:string|null} };
const app = new Hono<{Bindings:Env;Variables:Vars}>();
const id=()=>crypto.randomUUID();
const jsonError=(c:Context,msg:string,status:400|401|403|404|500|502|503=400)=>c.json({error:msg},status);
const enc=(s:string)=>new TextEncoder().encode(s);
async function hashPassword(password:string,salt:string){
 const key=await crypto.subtle.importKey('raw',enc(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc(salt),iterations:210000,hash:'SHA-256'},key,256);
 return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function hashToken(token:string,secret:string){
 const key=await crypto.subtle.importKey('raw',enc(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('HMAC',key,enc(token));
 return [...new Uint8Array(signature)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function safeEqual(a:string,b:string){
 if(a.length!==b.length)return false;
 let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
 return mismatch===0;
}
function validEmail(email:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=254;}
function normalizedEmail(value:unknown){return String(value||'').trim().toLowerCase();}
app.use('/api/*',cors({origin:(origin,c)=>{
 const allowed=(c.env.ALLOWED_ORIGINS||'').split(',').map((x:string)=>x.trim()).filter(Boolean);
 // Same-origin calls do not need CORS headers. Cross-origin calls require an exact allowlist match.
 return origin&&allowed.includes(origin)?origin:'';
},credentials:true,allowMethods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],allowHeaders:['Content-Type']}));
app.use('/api/*',async(c,next)=>{
 if(c.req.path==='/api/health'||c.req.path==='/api/auth/setup-status'||c.req.path==='/api/auth/register'||c.req.path==='/api/auth/login')return next();
 const secret=c.env.SESSION_SECRET;
 if(!secret||secret.length<32)return jsonError(c,'Authentication is not configured. Contact the administrator.',503);
 const token=getCookie(c,'me_session');
 if(!token)return jsonError(c,'Authentication required',401);
 const tokenHash=await hashToken(token,secret);
 const session=await c.env.DB.prepare('SELECT s.user_id,u.name,u.email,u.role,u.customer_id,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?')
 .bind(tokenHash,new Date().toISOString()).first<any>();
 if(!session||!session.active)return jsonError(c,'Invalid or expired session',401);
 c.set('user',{id:session.user_id,name:session.name,email:session.email,role:session.role,customer_id:session.customer_id});
 await next();
});
app.get('/api/health',c=>c.json({ok:true,app:'METEORS ENERGY CRM',authConfigured:!!c.env.SESSION_SECRET&&c.env.SESSION_SECRET.length>=32}));
app.get('/api/auth/setup-status',async c=>{
 const count=await c.env.DB.prepare('SELECT COUNT(*) n FROM users').first<any>();
 return c.json({needs_setup:Number(count?.n||0)===0,authConfigured:!!c.env.SESSION_SECRET&&c.env.SESSION_SECRET.length>=32});
});
app.post('/api/auth/register',async c=>{
 const secret=c.env.SESSION_SECRET;
 if(!secret||secret.length<32)return jsonError(c,'Administrator setup is temporarily unavailable. Contact support.',503);
 let body:any;try{body=await c.req.json<any>();}catch{return jsonError(c,'Invalid JSON body');}
 const name=String(body.name||'').trim(),email=normalizedEmail(body.email),password=String(body.password||'');
 if(name.length<2||name.length>100)return jsonError(c,'Enter a valid admin name (2–100 characters)');
 if(!validEmail(email))return jsonError(c,'Enter a valid email address');
 if(password.length<12||password.length>256)return jsonError(c,'Password must contain 12–256 characters');
 const salt=id(),uid=id(),token=id()+id(),expires=new Date(Date.now()+8*60*60*1000).toISOString();
 const passwordHash=await hashPassword(password,salt),tokenHash=await hashToken(token,secret);
 // The first-admin creation and its initial login are one atomic transaction.
 const result=await c.env.DB.batch([
  c.env.DB.prepare("INSERT INTO users(id,name,email,role,password_hash,password_salt) SELECT ?,?,?,'admin',?,? WHERE NOT EXISTS (SELECT 1 FROM users)")
   .bind(uid,name,email,passwordHash,salt),
  c.env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM users WHERE id=?)')
   .bind(tokenHash,uid,expires,uid)
 ]);
 const inserted=Number(result[0]?.meta?.changes||0);
 if(!inserted)return jsonError(c,'Initial administrator already exists. Please sign in.',403);
 setCookie(c,'me_session',token,{httpOnly:true,secure:new URL(c.req.url).protocol==='https:',sameSite:'Lax',path:'/',maxAge:28800});
 return c.json({ok:true,user:{id:uid,name,email,role:'admin'}},201);
});
app.post('/api/auth/login',async c=>{
 const secret=c.env.SESSION_SECRET;
 if(!secret||secret.length<32)return jsonError(c,'Login is temporarily unavailable because authentication is not configured.',503);
 let b:any;try{b=await c.req.json<any>();}catch{return jsonError(c,'Invalid JSON body');}
 const email=normalizedEmail(b.email),password=String(b.password||'');
 if(!validEmail(email)||!password||password.length>256)return jsonError(c,'Invalid email or password',401);
 const u=await c.env.DB.prepare('SELECT id,name,email,role,password_hash,password_salt,customer_id FROM users WHERE email=? AND active=1').bind(email).first<any>();
 if(!u)return jsonError(c,'Invalid email or password',401);
 const supplied=await hashPassword(password,u.password_salt);
 if(!safeEqual(supplied,u.password_hash))return jsonError(c,'Invalid email or password',401);
 const token=id()+id(),expires=new Date(Date.now()+8*60*60*1000).toISOString(),tokenHash=await hashToken(token,secret);
 await c.env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(tokenHash,u.id,expires).run();
 setCookie(c,'me_session',token,{httpOnly:true,secure:new URL(c.req.url).protocol==='https:',sameSite:'Lax',path:'/',maxAge:28800});
 return c.json({user:{id:u.id,name:u.name,email:u.email,role:u.role}});
});
app.post('/api/auth/logout',async c=>{
 const secret=c.env.SESSION_SECRET,token=getCookie(c,'me_session');
 if(token&&secret&&secret.length>=32)await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hashToken(token,secret)).run();
 deleteCookie(c,'me_session',{path:'/',secure:new URL(c.req.url).protocol==='https:',sameSite:'Lax'});
 return c.json({ok:true});
});
app.get('/api/auth/me',c=>c.json({user:c.get('user')}));
const roleMatrix:Record<string,Role[]>={leads:['admin','manager','salesperson'],customers:['admin','manager','salesperson','accountant'],quotations:['admin','manager','salesperson','accountant'],projects:['admin','manager','installer'],followups:['admin','manager','salesperson'],payments:['admin','manager','accountant'],team:['admin','manager'],inventory:['admin','manager','installer'],activities:['admin','manager'],support:['admin','manager','customer'],documents:['admin','manager','accountant','installer','customer']};
const resources:Record<string,{table:string;fields:string[];sort:string}>={
 leads:{table:'leads',fields:['customer_name','company','phone','whatsapp','email','address','city','category','capacity_kw','monthly_bill','source','assigned_to','enquiry_date','followup_date','status','notes','customer_id'],sort:'created_at DESC'},
 customers:{table:'customers',fields:['name','company','phone','whatsapp','email','address','city','category','gstin','notes'],sort:'created_at DESC'},
 quotations:{table:'quotations',fields:['quotation_no','customer_id','lead_id','capacity_kw','panel_brand','inverter_brand','structure_amount','cable_amount','protection_amount','installation_amount','transport_amount','subtotal','discount','gst_percent','total','validity_date','status','terms'],sort:'created_at DESC'},
 projects:{table:'projects',fields:['project_no','customer_id','quotation_id','location','capacity_kw','value','manager_id','installation_team','start_date','expected_date','completed_date','stage','progress','notes'],sort:'created_at DESC'},
 followups:{table:'followups',fields:['lead_id','customer_id','assigned_to','due_at','note','outcome','completed'],sort:'due_at ASC'},
 payments:{table:'payments',fields:['invoice_no','customer_id','project_id','total_amount','amount','payment_date','mode','reference','status'],sort:'created_at DESC'},
 inventory:{table:'inventory',fields:['sku','name','category','unit','quantity','purchase_price','supplier'],sort:'name ASC'},
 support:{table:'support_requests',fields:['customer_id','subject','message','status'],sort:'created_at DESC'}
};
function permitted(c:Context,resource:string){const user=c.get('user') as Vars['user'];return (roleMatrix[resource]||[]).includes(user.role);}
for(const [resource,config] of Object.entries(resources)){
 app.get('/api/'+resource,async c=>{if(!permitted(c,resource))return jsonError(c,'Forbidden',403);const user=c.get('user');const limit=Math.min(200,Math.max(1,Number(c.req.query('limit')||100)));const q=c.req.query('q');let sql='SELECT * FROM '+config.table;const binds:any[]=[];if(user.role==='customer'&&resource==='support'){sql+=' WHERE customer_id=?';binds.push(user.customer_id||'');}else if(user.role==='customer')return jsonError(c,'Forbidden',403);if(q&&['leads','customers','inventory'].includes(resource)){sql+=(binds.length?' AND':' WHERE')+(resource==='leads'?' (customer_name LIKE ? OR phone LIKE ?)':resource==='customers'?' (name LIKE ? OR phone LIKE ?)':' (name LIKE ? OR sku LIKE ?)');binds.push('%'+q+'%','%'+q+'%');}sql+=' ORDER BY '+config.sort+' LIMIT ?';binds.push(limit);const result=await c.env.DB.prepare(sql).bind(...binds).all();return c.json({items:result.results||[]});});
 app.post('/api/'+resource,async c=>{if(!permitted(c,resource))return jsonError(c,'Forbidden',403);const b=await c.req.json<any>();const fields=config.fields.filter(f=>b[f]!==undefined);if(!fields.length)return jsonError(c,'At least one valid field required');if(resource==='leads'&&!b.customer_name)return jsonError(c,'Customer name required');if(resource==='customers'&&!b.name)return jsonError(c,'Customer name required');if(resource==='inventory'&&!b.name)return jsonError(c,'Item name required');if(resource==='support'){b.customer_id=(c.get('user') as any).customer_id;if(!b.customer_id)return jsonError(c,'Customer account is not linked',403);}const rid=id();const cols=['id',...fields];const vals=[rid,...fields.map(f=>b[f])];await c.env.DB.prepare('INSERT INTO '+config.table+' ('+cols.join(',')+') VALUES ('+cols.map(()=>'?').join(',')+')').bind(...vals).run();await c.env.DB.prepare('INSERT INTO activities(id,actor_id,entity_type,entity_id,action) VALUES(?,?,?,?,?)').bind(id(),(c.get('user') as any).id,resource,rid,'created').run();return c.json({id:rid,ok:true},201);});
 app.put('/api/'+resource+'/:id',async c=>{if(!permitted(c,resource))return jsonError(c,'Forbidden',403);const b=await c.req.json<any>();const fields=config.fields.filter(f=>b[f]!==undefined);if(!fields.length)return jsonError(c,'No editable fields provided');const sets=fields.map(f=>f+'=?').join(',');const result=await c.env.DB.prepare('UPDATE '+config.table+' SET '+sets+(resource==='leads'?',updated_at=CURRENT_TIMESTAMP':'')+' WHERE id=?').bind(...fields.map(f=>b[f]),c.req.param('id')).run();return c.json({ok:!!result.meta.changes});});
 app.delete('/api/'+resource+'/:id',async c=>{if((c.get('user') as any).role!=='admin')return jsonError(c,'Admin only',403);await c.env.DB.prepare('DELETE FROM '+config.table+' WHERE id=?').bind(c.req.param('id')).run();return c.json({ok:true});});
}
app.get('/api/dashboard',async c=>{if(!['admin','manager','accountant'].includes((c.get('user') as any).role))return jsonError(c,'Forbidden',403);const db=c.env.DB;const one=async(sql:string)=>Number((await db.prepare(sql).first<any>())?.n||0);const [leads,customers,projects,completed,quotes,revenue,pending,followups]=await Promise.all([one('SELECT COUNT(*) n FROM leads'),one('SELECT COUNT(*) n FROM customers'),one('SELECT COUNT(*) n FROM projects'),one("SELECT COUNT(*) n FROM projects WHERE stage='Completed'"),one('SELECT COALESCE(SUM(total),0) n FROM quotations'),one('SELECT COALESCE(SUM(amount),0) n FROM payments'),one('SELECT COALESCE(SUM(total_amount-amount),0) n FROM payments WHERE status!=\'Paid\''),one('SELECT COUNT(*) n FROM followups WHERE completed=0 AND due_at<=date(\'now\',\'+7 day\')')]);return c.json({leads,customers,projects,completed,quotes,revenue,pending,followups});});
app.get('/api/activities',async c=>{if(!permitted(c,'activities'))return jsonError(c,'Forbidden',403);const r=await c.env.DB.prepare('SELECT a.*,u.name actor_name FROM activities a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 50').all();return c.json({items:r.results||[]});});
app.get('/api/team',async c=>{if(!permitted(c,'team'))return jsonError(c,'Forbidden',403);const r=await c.env.DB.prepare('SELECT id,name,email,phone,role,active,created_at FROM users ORDER BY name').all();return c.json({items:r.results||[]});});
app.post('/api/team',async c=>{if((c.get('user') as any).role!=='admin')return jsonError(c,'Admin only',403);const b=await c.req.json<any>();if(!b.name||!b.email||!b.password||b.password.length<12||!['manager','salesperson','accountant','installer'].includes(b.role))return jsonError(c,'Valid name, email, role and 12+ char password required');const email=normalizedEmail(b.email);if(!validEmail(email)||String(b.name).trim().length<2||String(b.password).length<12||String(b.password).length>256)return jsonError(c,'Valid name, email and 12–256 character password required');const salt=id(),uid=id();await c.env.DB.prepare('INSERT INTO users(id,name,email,phone,role,password_hash,password_salt) VALUES(?,?,?,?,?,?,?)').bind(uid,String(b.name).trim(),email,b.phone||null,b.role,await hashPassword(b.password,salt),salt).run();return c.json({id:uid},201);});
app.get('/api/customer-portal',async c=>{const u=c.get('user');if(u.role!=='customer'||!u.customer_id)return jsonError(c,'Customer account required',403);const cid=u.customer_id;const [customer,projects,quotes,payments,docs]=await Promise.all([c.env.DB.prepare('SELECT id,name,company,phone,email,address FROM customers WHERE id=?').bind(cid).first(),c.env.DB.prepare('SELECT * FROM projects WHERE customer_id=?').bind(cid).all(),c.env.DB.prepare('SELECT * FROM quotations WHERE customer_id=?').bind(cid).all(),c.env.DB.prepare('SELECT * FROM payments WHERE customer_id=?').bind(cid).all(),c.env.DB.prepare('SELECT id,file_name,content_type,created_at FROM documents WHERE customer_id=?').bind(cid).all()]);return c.json({customer,projects:projects.results,quotations:quotes.results,payments:payments.results,documents:docs.results});});
app.post('/api/customer-portal/support',async c=>{const u=c.get('user');if(u.role!=='customer'||!u.customer_id)return jsonError(c,'Customer account required',403);const b=await c.req.json<any>();if(!b.subject||!b.message)return jsonError(c,'Subject and message required');const rid=id();await c.env.DB.prepare('INSERT INTO support_requests(id,customer_id,subject,message) VALUES(?,?,?,?)').bind(rid,u.customer_id,b.subject,b.message).run();return c.json({id:rid},201);});
app.get('/api/documents',async c=>{
 const u=c.get('user');
 if(!['admin','manager','accountant','installer','customer'].includes(u.role))return jsonError(c,'Forbidden',403);
 let sql='SELECT id,customer_id,project_id,file_name,content_type,uploaded_by,created_at FROM documents';
 const binds:any[]=[];
 if(u.role==='customer'){sql+=' WHERE customer_id=?';binds.push(u.customer_id||'');}
 sql+=' ORDER BY created_at DESC LIMIT 100';
 const result=await c.env.DB.prepare(sql).bind(...binds).all();
 return c.json({items:result.results||[]});
});
app.post('/api/documents',async c=>{
 const u=c.get('user');
 if(!['admin','manager','accountant','installer'].includes(u.role))return jsonError(c,'Forbidden',403);
 let form:FormData;try{form=await c.req.formData();}catch{return jsonError(c,'Upload form is invalid');}
 const file=form.get('file');
 if(!(file instanceof File))return jsonError(c,'Choose a file to upload');
 if(file.size<1||file.size>10*1024*1024)return jsonError(c,'File size must be between 1 byte and 10 MB');
 const allowed=new Set(['application/pdf','image/jpeg','image/png','image/webp','text/plain','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
 if(!allowed.has(file.type))return jsonError(c,'Allowed files: PDF, JPG, PNG, WEBP, TXT, XLSX, DOCX');
 const customerId=String(form.get('customer_id')||'').trim()||null;
 const projectId=String(form.get('project_id')||'').trim()||null;
 if(customerId&&!await c.env.DB.prepare('SELECT id FROM customers WHERE id=?').bind(customerId).first())return jsonError(c,'Customer not found');
 if(projectId&&!await c.env.DB.prepare('SELECT id FROM projects WHERE id=?').bind(projectId).first())return jsonError(c,'Project not found');
 const docId=id(),key='file:'+docId;
 try{
  await c.env.DOC_INDEX.put(key,await file.arrayBuffer(),{metadata:{fileName:file.name,contentType:file.type}});
  await c.env.DB.prepare('INSERT INTO documents(id,customer_id,project_id,file_key,file_name,content_type,uploaded_by) VALUES(?,?,?,?,?,?,?)')
   .bind(docId,customerId,projectId,key,file.name.slice(0,255),file.type,u.id).run();
 }catch(error){await c.env.DOC_INDEX.delete(key);throw error;}
 return c.json({id:docId,file_name:file.name},201);
});
app.get('/api/files/:id',async c=>{
 const u=c.get('user');
 const d=await c.env.DB.prepare('SELECT * FROM documents WHERE id=?').bind(c.req.param('id')).first<any>();
 if(!d)return jsonError(c,'Not found',404);
 if(u.role==='customer'&&d.customer_id!==u.customer_id)return jsonError(c,'Forbidden',403);
 if(!['admin','manager','accountant','installer','customer'].includes(u.role))return jsonError(c,'Forbidden',403);
 const stored=await c.env.DOC_INDEX.get(d.file_key||'file:'+d.id,'arrayBuffer');
 if(!stored)return jsonError(c,'Document file is missing from storage',404);
 return new Response(stored,{headers:{'Content-Type':d.content_type||'application/octet-stream','Content-Disposition':'attachment; filename="'+String(d.file_name).replace(/[\\r\\n"]/g,'')+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
});
app.onError((err,c)=>{console.error(JSON.stringify({message:'CRM request failed',path:c.req.path,error:err instanceof Error?err.message:'unknown'}));return c.json({error:'Internal server error'},500);});
app.notFound(c=>c.req.path.startsWith('/api/')?c.json({error:'API route not found'},404):c.env.ASSETS.fetch(c.req.raw));
export default app;
