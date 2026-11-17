import {handle} from '../src/service.mjs';

// IndexedDB transactions keep updates atomic across tabs in the same browser.
export function openLocalDatabase(factory=globalThis.indexedDB,name='hotelmanager-offline-v1'){
 return new Promise((resolve,reject)=>{if(!factory)return reject(new Error('Браузер не разрешает локальное хранилище. Откройте файл в обычном Chrome или Edge.'));const opening=factory.open(name,1);opening.onupgradeneeded=()=>opening.result.createObjectStore('hotel_store');opening.onerror=()=>reject(opening.error);opening.onblocked=()=>reject(new Error('Закройте другие вкладки HotelManager и повторите запуск.'));opening.onsuccess=()=>resolve(opening.result)})
}
export function localAdapter(database){
 function execute(query,args,write){return new Promise((resolve,reject)=>{const tx=database.transaction('hotel_store',write?'readwrite':'readonly'),store=tx.objectStore('hotel_store');let result;const req=store.get(1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const row=req.result;if(query.startsWith('SELECT'))result=row;else if(query.startsWith('INSERT')){if(!row){store.put({body:args[0],rev:0},1);result={meta:{changes:1}}}else result={meta:{changes:0}}}else if(query.startsWith('UPDATE')){if(row&&row.rev===args[2]){store.put({body:args[0],rev:args[1]},1);result={meta:{changes:1}}}else result={meta:{changes:0}}}else{tx.abort();reject(new Error('Неизвестная локальная операция'))}};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error??new Error('Не удалось сохранить данные браузера'));tx.onabort=()=>reject(tx.error??new Error('Локальная операция отменена'))})}
 return{prepare(query){const statement=args=>({first:()=>execute(query,args,false),run:()=>execute(query,args,true)});return{...statement([]),bind:(...args)=>statement(args)}}}
}
export function offlineClient(db,storage){
 const key='hotel-offline-session';let memory='';const read=()=>{try{return storage.getItem(key)??memory}catch{return memory}};
 function remember(value){memory=value;try{if(value)storage.setItem(key,value);else storage.removeItem(key)}catch{}}
 return{async request(path,method='GET',data){
  const token=read();
  // Plain local request object: no fetch, no real cookies, no browser header guards.
  const input={url:'https://hotel.offline/api/'+path,method,headers:new Headers({origin:'https://ilatrion.github.io',...(token?{authorization:'Bearer '+token}:{}),...(method==='POST'?{'Content-Type':'application/json','X-Hotel-Client':'1'}:{})}),text:async()=>JSON.stringify(data)};
  const response=await handle(input,{DB:db});const body=await response.json();
  if(response.ok&&body.sessionToken)remember(body.sessionToken);
  if(path==='logout'&&response.ok)remember('');
  if(path==='bootstrap'&&response.ok&&!body.user)remember('');
  return{ok:response.ok,status:response.status,data:body};
 }}
}
