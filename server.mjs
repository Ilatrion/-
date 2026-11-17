import {adapter} from './src/sqlite.mjs';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {handle} from './src/service.mjs';
const root=dirname(fileURLToPath(import.meta.url));mkdirSync(join(root,'data'),{recursive:true});
const sql=new DatabaseSync(join(root,'data','hotel.sqlite'));sql.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');sql.exec(readFileSync(join(root,'drizzle/0000_hotel_store.sql'),'utf8'));

const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',jpg:'image/jpeg',svg:'image/svg+xml',md:'text/plain; charset=utf-8'};
const assets={};function files(dir,prefix=''){for(const name of readdirSync(dir)){const path=join(dir,name);if(statSync(path).isDirectory())files(path,prefix+name+'/');else assets[prefix+name]={bytes:readFileSync(path),type:types[name.split('.').at(-1)]??'application/octet-stream'}}}files(join(root,'public'));
const env={...process.env,DB:adapter(sql)};
const server=http.createServer(async(req,res)=>{try{const parts=[];let size=0;for await(const p of req){size+=p.length;if(size>65536){res.writeHead(413);res.end('Слишком большой запрос');return}parts.push(p)}const hostname=req.headers.host??'localhost';const r=new Request('http://'+hostname+(req.url??'/'),{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(parts)});const response=await handle(r,env,assets);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch{res.writeHead(500);res.end('Ошибка запроса')}});
const port=Number(process.env.PORT??3000),host=process.env.HOST??'127.0.0.1';server.listen(port,host,()=>console.log(`HotelManager: http://${host}:${port}\nОбщая база: data/hotel.sqlite\nОстановить: Ctrl+C`));
