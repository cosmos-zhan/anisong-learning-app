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
// Instrument the Web Audio boundary so a bar click must reach the real SynthPiano.
// This checks node scheduling, not audible output or Android audio policy.
const oscillators=[];
const parameter=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(){}});
const gain=()=>({gain:parameter(),connect(){return this;},disconnect(){}});
globalThis.AudioContext=class {
 currentTime=0;state='suspended';destination={};onstatechange=null;
 async resume(){this.state='running';}
 async close(){this.state='closed';}
 createGain(){return gain();}
 createOscillator(){const node={frequency:{value:0},connect(){return gain();},disconnect(){},start(at){this.started=at;},stop(at){this.stopped=at;},onended:null};oscillators.push(node);return node;}
};
const errors=[];window.addEventListener('error',event=>errors.push(event.message));process.on('unhandledRejection',error=>errors.push(String(error)));
try{
 const entry=html.match(/src="([^\"]+\.js)"/)[1];await import(pathToFileURL(resolve(dist,entry)));
 const deadline=Date.now()+20000;
 while(Date.now()<deadline){
  await new Promise(r=>setTimeout(r,50));
  if(document.querySelector('.score-message[role=alert]'))throw new Error('Production score renderer reported an error.');
  if(document.querySelector('.measure-hit')&&!document.querySelector('.score-message[role=status]'))break;
 }
 if(!document.querySelector('.score-sheet svg'))throw new Error('Production score SVG was not created.');
 if(document.querySelector('.score-message[role=status]'))throw new Error('Production renderer did not finish.');
 const notation=document.querySelector('.score-sheet svg');
 if(Number(notation.getAttribute('width'))<100||notation.querySelectorAll('path,ellipse').length<5)throw new Error('Production notation was replaced by an icon or empty SVG.');
 const scale=Number(document.querySelector('.score-sheet').dataset.scoreScale);
 if(!Number.isFinite(scale)||scale<=0||scale>1.6||document.querySelector('.score-fit-frame').style.visibility!=='visible')throw new Error('Production notation fit is invalid or hidden.');
 const bars=document.querySelectorAll('.measure-hit').length;
 if(bars<1||bars>4||errors.length)throw new Error('Production window/DOM failed: '+errors.join(';'));
 const bar=document.querySelector('button[aria-label="谱面小节 1"]');
 if(!bar)throw new Error('Production first bar button missing.');
 bar.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
 const audioDeadline=Date.now()+2000;
 while(Date.now()<audioDeadline&&!oscillators.some(o=>Number.isFinite(o.started)))await new Promise(r=>setTimeout(r,20));
 if(!oscillators.some(o=>Number.isFinite(o.started)))throw new Error('Production bar selection never reached Web Audio: '+document.querySelector('.piano-status')?.textContent);
 const transport=document.querySelector('.piano-play');
 if(transport.disabled||transport.getAttribute('aria-label')!=='暂停')throw new Error('Production audition did not enter playing state.');
 transport.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
 await new Promise(r=>setTimeout(r,20));
 if(document.querySelector('.piano-play').getAttribute('aria-label')!=='播放')throw new Error('Production pause failed.');
 if(errors.length)throw new Error('Production playback DOM failed: '+errors.join(';'));
 const until=async test=>{const end=Date.now()+2000;while(!test()&&Date.now()<end)await new Promise(r=>setTimeout(r,20));if(!test())throw new Error('Production navigation did not settle: '+test.toString()+'; route='+location.hash+'; panel='+document.querySelector('[role=dialog]')?.getAttribute('aria-label'));};
 const click=node=>{if(!node)throw new Error('Production UI target missing.');node.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));};
 const buttonText=text=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===text);

 // Exercise the delivered range/speed panels and their real browser history entries.
 click(document.querySelector('.speed-button'));await until(()=>document.querySelector('[aria-label="钢琴练习速度"]'));
 const speedPanel=document.querySelector('[role=dialog]');
 if(speedPanel.querySelector('select')||speedPanel.querySelectorAll('.speed-options button').length!==4)throw new Error('Speed entry is not a dedicated panel.');
 click(document.querySelector('[aria-label="关闭练习速度"]'));await until(()=>!document.querySelector('[role=dialog]'));
 click(document.querySelector('.range-button'));await until(()=>document.querySelector('.measure-grid'));
 click(document.querySelector('[aria-label="选择第 8 小节"]'));await until(()=>document.querySelector('.range-anchor')?.textContent==='8');click(document.querySelector('[aria-label="选择第 5 小节"]'));
 await until(()=>document.querySelector('.range-preview')?.textContent.includes('5–8'));
 click(buttonText('确认范围'));await until(()=>!document.querySelector('[role=dialog]'));
 if(!document.querySelector('.range-button')?.textContent.includes('5–8'))throw new Error('Confirmed range did not reach the actual controller.');
 click(document.querySelector('.range-button'));await until(()=>document.querySelector('.measure-grid'));history.back();await until(()=>!document.querySelector('[role=dialog]'));
 if(location.hash!=='#piano'||!document.querySelector('.piano-practice'))throw new Error('Panel Back changed the practice route.');
 if(document.querySelector('.bottom-nav'))throw new Error('Practice unexpectedly includes bottom navigation.');
 // Parameter entries must have distinct content in the emitted application.
 const option=(group,title)=>Array.from(document.querySelectorAll(`[aria-label="${group}"] button`)).find(b=>b.querySelector('strong')?.textContent===title);
 click(document.querySelector('.mode-pill'));await until(()=>document.querySelector('[aria-label="钢琴练习方式"]'));
 if(document.querySelector('[role=dialog] select')||document.querySelectorAll('[aria-label="钢琴练习方式"] button').length!==3)throw new Error('Mode panel mixed unrelated settings.');
 click(option('钢琴练习方式','自由弹奏'));await until(()=>document.querySelector('.mode-pill')?.textContent==='自由弹奏');
 if(!document.querySelector('.piano-play').disabled)throw new Error('Free practice left auto playback enabled.');
 click(document.querySelector('[aria-label="关闭练习方式"]'));await until(()=>!document.querySelector('[role=dialog]'));
 click(buttonText('音名辅助'));await until(()=>document.querySelector('[aria-label="钢琴音符辅助"]'));
 click(option('钢琴音符辅助','固定唱名'));await until(()=>document.querySelector('.piano-key.white span')?.textContent==='Do');
 click(document.querySelector('[aria-label="关闭音符辅助"]'));await until(()=>!document.querySelector('[role=dialog]'));
 click(document.querySelector('[aria-label="钢琴声部与轨道"]'));await until(()=>document.querySelector('.track-options'));
 if(document.querySelectorAll('[role=dialog] select').length!==2||document.querySelector('[role=dialog] .speed-options'))throw new Error('Track panel is not dedicated.');
 click(document.querySelector('[aria-label="关闭声部与轨道"]'));await until(()=>!document.querySelector('[role=dialog]'));
 click(document.querySelector('.mode-pill'));await until(()=>document.querySelector('[aria-label="钢琴练习方式"]'));
 click(option('钢琴练习方式','自动试听'));await until(()=>document.querySelector('.mode-pill')?.textContent==='自动试听');
 click(document.querySelector('[aria-label="关闭练习方式"]'));await until(()=>!document.querySelector('[role=dialog]'));
 if(!document.querySelector('.range-button')?.textContent.includes('5–8'))throw new Error('Mode or label change lost the range.');

 click(document.querySelector('[aria-label="更多钢琴操作"]'));await until(()=>buttonText('反馈 ↗'));
 click(buttonText('反馈 ↗'));await until(()=>document.querySelector('.report')?.value.includes('"piano"'));
 const report=document.querySelector('.report').value;
 if(!report.includes('"piano"')||!report.includes('"bars"')||!report.includes('"sha"'))throw new Error('Production feedback has no current practice snapshot.');
 click(document.querySelector('[aria-label="关闭反馈"]'));await until(()=>!document.querySelector('.feedback-modal'));
 click(document.querySelector('[aria-label="退出钢琴练习"]'));await until(()=>buttonText('暂停并返回'));
 click(buttonText('暂停并返回'));await until(()=>document.querySelector('.piano-preparation')&&document.querySelector('.bottom-nav'));
 click(document.querySelector('.bottom-nav [aria-label="练习"]'));await until(()=>document.querySelector('.page-home'));
 if(!document.querySelector('.browse h1')?.textContent.includes('今天'))throw new Error('Production home missing.');
 click(document.querySelector('.bottom-nav [aria-label="曲库"]'));await until(()=>document.querySelector('.library-list'));
 if(!document.querySelector('.song-row'))throw new Error('Production song library missing.');

 console.log(JSON.stringify({check:'production-esm-dom',svg:true,uniformScale:scale,visibleBars:bars,page:document.querySelector('.score-page-controls span')?.textContent,compatible:!!document.querySelector('.score-compatibility'),barClickScheduledOscillators:oscillators.length,pause:true,feedbackSnapshot:true,practiceExit:true,homeAndLibrary:true,rangeGrid:true,dedicatedSpeed:true,panelBack:true,dedicatedMode:true,dedicatedTracks:true,dedicatedLabels:true,method:'jsdom, deterministic text metrics and instrumented Web Audio nodes; not physical browser/audio verification'}));
 dom.window.close();process.exit(0);
}catch(error){console.error(error.message);dom.window.close();process.exit(1);}
