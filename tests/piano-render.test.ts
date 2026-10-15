import {it,expect,vi} from 'vitest';
import {demoScore} from './piano-fixtures';
import {engrave} from '../apps/web/src/piano/engraver';
it('real OSMD produces SVG and maps eight bars / selected voice note coordinates (jsdom text metric shim)',async()=>{
 // jsdom has no canvas rasterizer. This exercises real OSMD/VexFlow SVG layout,
 // with deterministic text widths, not a browser visual/typography acceptance test.
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(()=>new Proxy({font:'',measureText:(text:string)=>({width:String(text).length*7}),getImageData:()=>({data:new Uint8ClampedArray(400)})},{get(target,key){return key in target?target[key as keyof typeof target]:()=>{};}}) as unknown as CanvasRenderingContext2D);
 const host=document.createElement('div');host.style.width='800px';document.body.append(host);
 try{
  const s=demoScore(),part=s.parts[0],layout=await engrave(host,s,part,part.tracks[0]);
  expect(host.querySelector('svg')).not.toBeNull();expect(host.querySelectorAll('svg path').length).toBeGreaterThan(30);expect(layout.bars).toHaveLength(8);
  expect(layout.notes).toHaveLength(25);for(const bar of layout.bars){expect(bar.width).toBeGreaterThan(20);expect(bar.height).toBeGreaterThan(30);}
  for(const n of layout.notes){const bar=layout.bars[n.event.measure];expect(n.x).toBeGreaterThanOrEqual(bar.x-1);expect(n.x).toBeLessThan(bar.x+bar.width+1);}
  layout.notes[0].graphic.setColor('#087b76',{applyToNoteheads:true,applyToStem:true});expect(host.innerHTML).toContain('#087b76');
 }finally{host.remove();}
},15000);
