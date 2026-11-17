import {cpSync,mkdirSync,writeFileSync,readFileSync,readdirSync,statSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
const output=resolve('pages');rmSync(output,{recursive:true,force:true});mkdirSync(output,{recursive:true});cpSync('public',output,{recursive:true});
writeFileSync(join(output,'config.js'),"// API on Sites; database shared with the original application.\nwindow.HOTEL_API_BASE = 'https://hotelmanager-web-school-20261117.elegantgear3.chatgpt.site';\n");
writeFileSync(join(output,'.nojekyll'),'');
// Validate local static references under any GitHub Pages repository prefix.
const html=readFileSync(join(output,'index.html'),'utf8');for(const [,path] of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g)){if(!statSync(join(output,path)).isFile())throw Error('Missing asset: '+path)}
console.log('GitHub Pages files ready: pages/');
