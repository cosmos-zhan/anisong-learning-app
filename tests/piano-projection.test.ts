import {it,expect} from 'vitest';
import {parseMusicXml} from '../packages/piano/musicxml';
import {buildSteps} from '../packages/piano/timeline';
import {PianoController} from '../packages/piano/controller';
import {fixture,note,rest,PianoTestAudio} from './piano-fixtures';
const chord=()=>fixture([note('C')+note('E',480,'<chord/>')+note('G',480,'<chord/>')+rest()+note('D')]);
it('offers highest-note projection separately, retaining every original chord note and the original XML',()=>{
 const xml=chord(),s=parseMusicXml(xml),p=s.parts[0],projection=p.tracks.find(t=>t.projection==='highest')!;
 expect(s.xml).toBe(xml);expect(p.measures[0].events).toHaveLength(5);expect(p.tracks[0].blocked.join()).toContain('和弦');
 expect(projection.blocked).toEqual([]);const steps=buildSteps(s,p,projection,[0,0]);
 expect(steps.map(s=>s.pitch?.midi??null)).toEqual([67,null,62,null]);expect(steps[0].noteIds).toEqual([p.measures[0].events[2].id]);
});
it('never silently switches a blocked original chord track to simplified playback',async()=>{
 const s=parseMusicXml(chord()),audio=new PianoTestAudio(),c=new PianoController(audio);c.load(s);
 expect(c.track?.projection).toBeUndefined();expect(c.blocked).toContain('和弦');await c.play();expect(audio.calls).toHaveLength(0);
 const t=s.parts[0].tracks.find(t=>t.projection)!;c.selectPart(s.parts[0].id,t.id);await c.play();expect(audio.calls[0].midi).toBe(67);c.dispose();
});
it('waiting on a selected highest-note exercise advances only after the real target key',async()=>{
 const s=parseMusicXml(chord()),audio=new PianoTestAudio(),c=new PianoController(audio),p=s.parts[0],t=p.tracks.find(t=>t.projection)!;
 c.load(s,p.id,t.id);c.mode('wait');await c.play();c.press('wrong-chord-tone',60);expect(c.getSnapshot().step).toBe(0);
 c.press('highest',67);expect(c.getSnapshot().step).toBe(1);c.dispose();
});
it('does not project unresolved overlap, transposition, microtones or grace notes as safe exercises',()=>{
 const overlap=fixture([note('C',960)+note('G',960,'<chord/>')+'<backup><duration>480</duration></backup>'+note('D')]);
 const variants=[overlap,chord().replace('<clef>','<transpose><chromatic>2</chromatic></transpose><clef>'),chord().replace('<step>G</step>','<step>G</step><alter>0.5</alter>'),chord().replace('<pitch><step>C','<grace/><pitch><step>C')];
 for(const xml of variants)expect(parseMusicXml(xml).parts[0].tracks.some(t=>t.projection)).toBe(false);
});
it('retains tie joining and range-local reattack in projected exercises',()=>{
 const s=parseMusicXml(fixture([note('C',1920)+note('G',1920,'<chord/><tie type="start"/>'),note('C',1920)+note('G',1920,'<chord/><tie type="stop"/>')])),p=s.parts[0],t=p.tracks.find(t=>t.projection)!;
 const steps=buildSteps(s,p,t,[0,1]);expect(steps).toHaveLength(1);expect(steps[0].end).toBe(3840);expect(steps[0].noteIds).toHaveLength(2);
 expect(buildSteps(s,p,t,[1,1])[0].pitch?.midi).toBe(67);
});
