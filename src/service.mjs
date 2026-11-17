import {HttpError,fail,uid,seed,passwordHash,matches,hash,randomToken,contact,text,number,safeUser,projection,available,applyAction,audit,requireRole,report,today,dayAdd,ROOMS} from './engine.mjs';
export class Repository {
 constructor(db,seedPasswords={}){this.db=db;this.seedPasswords=seedPasswords}
 async load(){let row=await this.db.prepare('SELECT body, rev FROM hotel_store WHERE id = 1').first();if(!row){const initial=await seed(this.seedPasswords);await this.db.prepare('INSERT INTO hotel_store (id, body, rev) VALUES (1, ?, 0) ON CONFLICT(id) DO NOTHING').bind(JSON.stringify(initial)).run();row=await this.db.prepare('SELECT body, rev FROM hotel_store WHERE id = 1').first()}fail(row,'База ещё не готова',503);return {state:JSON.parse(row.body),revision:row.rev}}
 async mutate(fn){for(let i=0;i<6;i++){const {state,revision}=await this.load();const result=await fn(state);state.revision=revision+1;state.sessions=state.sessions.filter(x=>x.expires>Date.now());const serialized=JSON.stringify(state);fail(serialized.length<=8000000,'Учебная база достигла лимита размера. Сохраните экспорт и обратитесь к администратору',507);const update=await this.db.prepare('UPDATE hotel_store SET body = ?, rev = ? WHERE id = 1 AND rev = ?').bind(serialized,revision+1,revision).run();if(update.meta?.changes===1)return result}throw new HttpError(409,'Данные одновременно изменились. Повторите операцию')}
}
const json=(obj,status=200,headers={})=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const cookie=(token,secure)=>`hotel_sid=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure?'; Secure':''}`;
const PAGES_ORIGIN='https://ilatrion.github.io';
const isPagesRequest=r=>r.headers.get('origin')===PAGES_ORIGIN;
const getToken=r=>/^Bearer [a-f0-9]{64}$/.test(r.headers.get('authorization')??'')?r.headers.get('authorization').slice(7):(isPagesRequest(r)?'':getCookie(r));
const getCookie=r=>(r.headers.get('cookie')??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('hotel_sid='))?.slice(10)??'';
function identity(s,digest,verified=true){const session=s.sessions.find(x=>x.digest===digest&&x.expires>Date.now());fail(session,'Сессия истекла. Войдите снова',401);const u=s.users.find(u=>u.id===session.userId);fail(u,'Учётная запись недоступна',401);if(verified)fail(session.verified,'Подтвердите PIN',423);return {u,session}}
function sessionView(u,session){return {...safeUser(u),needsPin:!!u.pin&&!session.verified,needsSetup:!u.pin,verified:!!session.verified}}
async function body(req){const length=Number(req.headers.get('content-length')??0);fail(length<=65536,'Запрос слишком большой',413);const raw=await req.text();fail(new TextEncoder().encode(raw).length<=65536,'Запрос слишком большой',413);try{const p=JSON.parse(raw);fail(p&&typeof p==='object'&&!Array.isArray(p),'Ожидается объект JSON');return p}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Некорректный JSON')}}
function writeGuard(req){const origin=req.headers.get('origin');fail(!origin||origin===new URL(req.url).origin||isPagesRequest(req),'Запрос с другого сайта отклонён',403);fail(req.headers.get('x-hotel-client')==='1'&&req.headers.get('content-type')?.startsWith('application/json'),'Используйте форму сайта',415)}
function failedAttempt(s,key){const limit=s.limits[key]??{count:0,until:0};if(limit.until>Date.now())return 'Вход заблокирован на 5 минут. Дождитесь окончания блокировки';limit.count++;if(limit.count>=4){limit.until=Date.now()+300000;limit.count=0}s.limits[key]=limit;return limit.until>Date.now()?'Четыре ошибки: блокировка на 5 минут':'Неверные данные. Осталось попыток: '+(4-limit.count)}
function fresh(session){if(Date.now()-session.stepUpAt>300000){const e=new HttpError(428,'Подтвердите действие своим PIN');e.code='STEP_UP';throw e}}
const exportBusiness=s=>({format:'hotelmanager.web.backup.v1',exportedAt:new Date().toISOString(),hotel:s.hotel,rooms:ROOMS,bookings:s.bookings,guests:s.users.filter(u=>u.role==='guest').map(safeUser),charges:s.charges,payments:s.payments,checkouts:s.checkouts,care:s.care,notices:s.notices,audit:s.audit});
async function handleCore(request,env,assets={}){
 const url=new URL(request.url),path=url.pathname,repo=new Repository(env.DB,{admin:env.HOTEL_ADMIN_PASSWORD,guard:env.HOTEL_GUARD_PASSWORD,guest:env.HOTEL_GUEST_PASSWORD,guest2:env.HOTEL_GUEST2_PASSWORD});let digest='';
 try{
  if(!path.startsWith('/api/')){const file=path==='/'?'index.html':path.slice(1);const asset=assets[file];if(!asset)return new Response('Страница не найдена',{status:404});return new Response(asset.bytes??asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",'Permissions-Policy':'camera=(self), microphone=()'}})}
  digest=await hash(getToken(request));
  if(request.method==='POST')writeGuard(request);
  if(path==='/api/login'&&request.method==='POST'){
   const p=await body(request),login=text(p.login,3,40).toLowerCase(),password=text(p.password,1,128);const token=randomToken(),tokenDigest=await hash(token);
   const result=await repo.mutate(async s=>{if(s.limits['login_'+login]?.until>Date.now())return{error:'Вход заблокирован на 5 минут',status:429};const u=s.users.find(x=>x.login===login);const ok=await matches(password,u?.password??s.users[0].password);if(!u||!ok){audit(s,{login},'login','Неверные реквизиты',false);return{error:failedAttempt(s,'login_'+login),status:401}}delete s.limits['login_'+login];const session={digest:tokenDigest,userId:u.id,expires:Date.now()+28800000,verified:false,stepUpAt:0};s.sessions.push(session);audit(s,u,'login','Пароль подтверждён');return{user:sessionView(u,session)}});
   if(result.error)return json(result,result.status);return isPagesRequest(request)?json({...result,sessionToken:token}):json(result,200,{'Set-Cookie':cookie(token,url.protocol==='https:')})
  }
  if(path==='/api/register'&&request.method==='POST'){
   const p=await body(request);const login=text(p.login,3,40).toLowerCase();fail(/^[a-z][a-z0-9_]{2,39}$/.test(login),'Логин: 3–40 латинских букв, цифр и _');const pass=text(p.password,8,128),c=contact(p),record=await passwordHash(pass);
   await repo.mutate(s=>{fail(!s.users.some(u=>u.login===login),'Такой логин уже занят',409);fail(s.users.length<500,'Достигнут лимит учебных аккаунтов');s.users.push({id:uid(),login,role:'guest',...c,password:record,pin:null,recovery:null,onboarded:false});audit(s,{login},'register','Создан гостевой аккаунт')});return json({ok:true})
  }
  if(path==='/api/logout'&&request.method==='POST'){await repo.mutate(s=>{const old=s.sessions.find(x=>x.digest===digest);if(old){const u=s.users.find(x=>x.id===old.userId);audit(s,u,'logout')}s.sessions=s.sessions.filter(x=>x.digest!==digest)});return json({ok:true},200,{'Set-Cookie':'hotel_sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'})}
  if(path==='/api/bootstrap'&&request.method==='GET'){
   const {state}=await repo.load();const session=state.sessions.find(x=>x.digest===digest&&x.expires>Date.now()),u=state.users.find(x=>x.id===session?.userId);
   return json(u?{user:sessionView(u,session),state:session.verified?projection(state,u):null,today:today(),serverTime:new Date().toISOString()}:{user:null,hotel:state.hotel,today:today(),serverTime:new Date().toISOString()})
  }
  if((path==='/api/pin'||path==='/api/pin/setup'||path==='/api/pin/recover')&&request.method==='POST'){
   const p=await body(request);let recovery=null;const result=await repo.mutate(async s=>{
    const {u,session}=identity(s,digest,false);const key='pin_'+u.id;const blocked=s.limits[key]?.until>Date.now();if(blocked)return{error:'PIN заблокирован на 5 минут',status:429};
    if(path==='/api/pin/setup'){
     fail(!u.pin,'PIN уже установлен');fail(/^\d{4,6}$/.test(p.pin),'PIN должен содержать 4–6 цифр');u.pin=await passwordHash(p.pin);recovery=randomToken().slice(0,24).toUpperCase();u.recovery=await hash(recovery);
    }else if(path==='/api/pin/recover'){
     const code=text(p.code,1,100).toUpperCase();if(!u.recovery||await hash(code)!==u.recovery){audit(s,u,'recovery','Неверный код',false);return{error:failedAttempt(s,key),status:401}}fail(/^\d{4,6}$/.test(p.pin),'PIN должен содержать 4–6 цифр');u.pin=await passwordHash(p.pin);recovery=randomToken().slice(0,24).toUpperCase();u.recovery=await hash(recovery);
    }else{fail(typeof p.pin==='string','Введите PIN');if(!await matches(p.pin,u.pin)){audit(s,u,'pin','Неверный PIN',false);return{error:failedAttempt(s,key),status:401}}}
    delete s.limits[key];session.verified=true;session.stepUpAt=Date.now();audit(s,u,path,'Локальное подтверждение выполнено');return{user:sessionView(u,session),recovery}
   });return json(result,result.status??200)
  }
  const loaded=await repo.load();const auth=identity(loaded.state,digest);
  if(path==='/api/availability'&&request.method==='GET')return json({rooms:available(loaded.state,Object.fromEntries(url.searchParams)),revision:loaded.revision});
  if(path==='/api/report'&&request.method==='GET'){requireRole(auth.u,['admin']);return json(report(loaded.state,url.searchParams.get('from')??today(),url.searchParams.get('to')??dayAdd(today(),30)))}
  if(path==='/api/export'&&request.method==='GET'){requireRole(auth.u,['admin']);fresh(auth.session);const result=exportBusiness(loaded.state);await repo.mutate(s=>{const {u}=identity(s,digest);requireRole(u,['admin']);audit(s,u,'export','Экспорт данных гостиницы')});return json(result)}
  if(path==='/api/action'&&request.method==='POST'){
   const p=await body(request);fail(typeof p.kind==='string','Нет команды');fail(typeof p.requestId==='string'&&/^[a-zA-Z0-9-]{8,100}$/.test(p.requestId),'Нет идентификатора операции');const fingerprint=await hash(JSON.stringify(p));
   const result=await repo.mutate(s=>{const {u,session}=identity(s,digest);if(p.kind==='hotel.update'||(p.kind==='payment.add'&&p.refund))fresh(session);const old=s.requests.find(x=>x.owner===u.id&&x.key===p.requestId);if(old){fail(old.fingerprint===fingerprint,'Идентификатор уже использован для другой операции',409);return {...old.result,repeated:true}}const result=applyAction(s,u,p);s.requests.push({owner:u.id,key:p.requestId,fingerprint,result});if(s.requests.length>5000)s.requests.splice(0,s.requests.length-5000);return result});return json({ok:true,...result})
  }
  throw new HttpError(404,'Запрос не найден');
 }catch(e){
  if(e instanceof HttpError){if(e.status===403&&digest)try{await repo.mutate(s=>{const found=s.sessions.find(x=>x.digest===digest);const u=s.users.find(x=>x.id===found?.userId);if(u)audit(s,u,'access:denied',path,false)})}catch{}return json({error:e.message,code:e.code??null},e.status)}
  console.error('HotelManager server error:',e?.name,e?.message);return json({error:'Сервер не смог выполнить запрос. Повторите позже.'},500)
 }
}

// GitHub Pages uses a tab-scoped bearer session; it never needs third-party cookies.
export async function handle(request,env,assets={}){
 const path=new URL(request.url).pathname;
 if(!path.startsWith('/api/'))return handleCore(request,env,assets);
 const origin=request.headers.get('origin');
 const crossOrigin=origin&&origin!==new URL(request.url).origin;
 if(crossOrigin&&!isPagesRequest(request))return json({error:'Запрос с другого сайта отклонён'},403);
 if(request.method==='OPTIONS'){
  if(!isPagesRequest(request))return json({error:'Источник не разрешён'},403);
  const method=request.headers.get('access-control-request-method');
  const headers=(request.headers.get('access-control-request-headers')??'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
  if(!['GET','POST'].includes(method)||headers.some(h=>!['content-type','authorization','x-hotel-client'].includes(h)))return json({error:'Запрос не разрешён'},403);
  return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':PAGES_ORIGIN,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Hotel-Client','Access-Control-Max-Age':'600','Vary':'Origin'}});
 }
 const response=await handleCore(request,env,assets);
 if(!isPagesRequest(request))return response;
 const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin',PAGES_ORIGIN);headers.set('Vary','Origin');
 return new Response(response.body,{status:response.status,headers});
}
