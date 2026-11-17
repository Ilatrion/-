import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
const read=p=>readFileSync(p,'utf8'),output=process.argv[2]??'pages';mkdirSync(output,{recursive:true});
const images={};for(const n of ['standard','comfort','suite'])images[n]='data:image/jpeg;base64,'+readFileSync('public/assets/'+n+'.jpg').toString('base64');
const strip=s=>s.replace(/^import .*;\n/gm,'').replace(/\bexport /g,'');
const core='const LocalCore=(()=>{'+strip(read('src/engine.mjs'))+'\n'+strip(read('src/service.mjs'))+';return {seed,handle};})();';
const store='const OfflineStore=(()=>{const handle=LocalCore.handle;'+strip(read('offline/local.mjs'))+';return {openLocalDatabase,localAdapter,offlineClient};})();';
let app=read('public/app.js');const start=app.indexOf('const API_BASE='),end=app.indexOf('\nasync function load',start);
app=app.slice(0,start)+`async function api(path,method='GET',data){const result=await window.HotelLocal.client.request(path,method,data);if(!result.ok)throw new ApiError(result.status,result.data);return result.data}\n`+app.slice(end);
app=app.replaceAll('./assets/${r.image}.jpg','${window.HOTEL_IMAGES[r.image]}').replaceAll("register?'':'guest'", "register?'':'admin'");
const errorStart=app.lastIndexOf('load().catch(');app=app.slice(0,errorStart)+'load().catch(showOfflineError);';
const syncStart=app.indexOf('function syncPage()'),syncEnd=app.indexOf('\nfunction ',syncStart+10);if(syncStart<0||syncEnd<0)throw Error('syncPage missing');
app=app.slice(0,syncStart)+`function syncPage(){return head('Локальная база','Автономная версия без сервера.')+'<div class="card stack"><h2>Данные в вашем браузере</h2><p>Брони, счета, уведомления и пользователи сохраняются в IndexedDB этого браузера. Несколько вкладок одного браузера видят изменения после обновления. Между разными устройствами данные не передаются.</p><p>Не очищайте данные сайта, если хотите сохранить работу. Экспорт администратора сохраняет деловые данные в JSON.</p><p>На GitHub Pages и в скачанном HTML используются разные локальные базы.</p></div>'}\n`+app.slice(syncEnd);
const securityStart=app.indexOf('function securityPage()'),securityEnd=app.indexOf('\nfunction ',securityStart+10);if(securityStart<0||securityEnd<0)throw Error('securityPage missing');
app=app.slice(0,securityStart)+`function securityPage(){return head('Учебная защита','Локальная демонстрация прав доступа.')+'<div class="card stack"><h2>Вход, роли и PIN</h2><p>Пароли и PIN хранятся как солёные PBKDF2-хеши. Интерфейс разделяет роли администратора, персонала и гостя. Учебные оплаты не переводят деньги.</p><p>В автономной версии вся база находится на устройстве. Человек с доступом к инструментам браузера может прочитать или изменить её. Это учебное разграничение интерфейса, а не серверная защита от владельца устройства.</p><p>Для новой базы пароль администратора создаётся при первом запуске. Гости регистрируются через форму входа. Восстановление PIN требует сохранённого кода.</p></div>'}\n`+app.slice(securityEnd);
const replacements=[
 ['Общая серверная база · учебная гостиница','Локальная база браузера · без сервера'],
 ['Общая база и обмен','Локальная база'],['общая серверная база','локальная база браузера'],
 ['Все устройства работают с базой одного сервера. Другой пользователь увидит изменения после обновления страницы или автоматической проверки каждые 15 секунд.','Данные сохраняются в текущем браузере. Вкладки одного браузера видят обновления примерно за 15 секунд; между компьютерами обмена нет.'],
 ['Браузерные разрешения выдаются самим браузером.','Браузерные разрешения выдаются самим браузером. Эта версия полностью автономна.'],
 ['Не удаляйте файл базы data/hotel.sqlite: там хранятся записи локального сервера.','Не очищайте данные сайта в браузере: там хранятся локальные записи.'],
 ['Для общих устройств используйте разные аккаунты и отдельные браузеры/профили.','Для проверки гостя и администратора используйте разные аккаунты в одном браузере.'],
 ['Сервер повторно проверяет','Приложение повторно проверяет'],['Сервер не позволяет','Приложение не позволяет'],
 ['на сайте применяются серверные сессии, PIN и проверка прав в API','в автономной версии применяются локальные сессии, PIN и учебное разделение ролей'],
 ['проверяются сервером','проверяются приложением'],['Проверить на сервере','Проверить код'],['с сервера','из локальной базы'],['сохраняются в общей базе','сохраняются в локальной базе'],['на сервере','в локальной базе'],['События сервера','События приложения'],['сервер:','приложение:']
];for(const [from,to] of replacements)app=app.replaceAll(from,to);
let css=read('public/styles.css');for(const [name,url] of Object.entries(images))css=css.replaceAll('./assets/'+name+'.jpg',url);
const script=s=>'<script>'+s.replace(/<\/script/gi,'<\\/script')+'</script>';
const favicon='data:image/svg+xml;base64,'+readFileSync('public/assets/favicon.svg').toString('base64');
const html='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="hotel-mode" content="offline"><title>HotelManager · автономная версия</title><link rel="icon" href="'+favicon+'"><style>'+css+'</style></head><body><div id="app"><div class="boot"><span class="logo">H</span><h1>HotelManager</h1><p>Открываем локальную базу…</p></div></div><dialog id="modal" aria-labelledby="modal-title"></dialog><dialog id="confirm" aria-labelledby="confirm-title"></dialog><div id="toasts" aria-live="polite" aria-atomic="true"></div><noscript>Включите JavaScript в браузере.</noscript>'+script(read('public/qr.js'))+script('window.HOTEL_IMAGES='+JSON.stringify(images)+';\n'+core+'\n'+store+'\n'+read('offline/start.js')+'\nwindow.HotelLocal.ready.then(()=>{\n'+app+'\n}).catch(showOfflineError);')+'</body></html>';
if(/\bfetch\s*\(|XMLHttpRequest|src=["']https?:|type="module"/.test(html))throw Error('Offline artifact contains a network request or module');
writeFileSync(join(output,'index.html'),html);writeFileSync(join(output,'.nojekyll'),'');console.log('Standalone offline HTML: '+join(output,'index.html')+' ('+html.length+' chars)');
