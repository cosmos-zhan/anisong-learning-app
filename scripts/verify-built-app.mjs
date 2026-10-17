import {JSDOM} from 'jsdom';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
// Execute the emitted ES modules and lazy renderer in a DOM, not Vite's source transform.
// This catches production import/layout failures; it is not a browser or listening test.
const dist=resolve('dist'),html=readFileSync(resolve(dist,'index.html'),'utf8');
const config=JSON.parse(readFileSync('apps/web/src/bundled-audio.json','utf8'));
const song=config.score?'haruhikage-crychic':'demo-original';
const dom=new JSDOM(html,{url:`https://build-check.invalid/?song=${song}#piano`,pretendToBeVisual:true});
for(const key of ['window','document','navigator','location','history','localStorage','DOMParser','XMLSerializer','MutationObserver','Element','HTMLElement','HTMLCanvasElement','Node','Event','CustomEvent','getComputedStyle'])Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:dom.window[key]});
globalThis.self=dom.window;globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
HTMLCanvasElement.prototype.getContext=function(){return new Proxy({font:'',measureText:text=>({width:String(text).length*7}),getImageData:()=>({data:new Uint8ClampedArray(4)})},{get:(target,key)=>key in target?target[key]:()=>{}});};
globalThis.fetch=async input=>{
 const url=new URL(String(input),'https://build-check.invalid/'),file=resolve(dist,'.'+url.pathname);
 if(url.origin!=='https://build-check.invalid'||!file.startsWith(dist+sep)||!existsSync(file))return new Response('Missing',{status:404});
 return new Response(readFileSync(file));
};
const errors=[];window.addEventListener('error',event=>errors.push(event.message));process.on('unhandledRejection',error=>errors.push(String(error)));
try{
 const entry=html.match(/src="([^\"]+\.js)"/)[1];await import(pathToFileURL(resolve(dist,entry)));
 const deadline=Date.now()+20000;
 while(Date.now()<deadline){
  await new Promise(r=>setTimeout(r,50));
  if(document.querySelector('.score-message[role=alert]'))throw new Error('Production score renderer reported an error.');
  if(document.querySelector('svg')&&!document.querySelector('.score-message[role=status]'))break;
 }
 if(!document.querySelector('svg'))throw new Error('Production score SVG was not created.');
 if(document.querySelector('.score-message[role=status]'))throw new Error('Production renderer did not finish.');
 const bars=document.querySelectorAll('.measure-hit').length;
 if(bars<1||bars>8||errors.length)throw new Error('Production window/DOM failed: '+errors.join(';'));
 console.log(JSON.stringify({check:'production-esm-dom',svg:true,visibleBars:bars,page:document.querySelector('.score-page-controls span')?.textContent,compatible:!!document.querySelector('.score-compatibility'),method:'jsdom with deterministic text metrics; not physical browser/audio verification'}));
 dom.window.close();process.exit(0);
}catch(error){console.error(error.message);dom.window.close();process.exit(1);}
