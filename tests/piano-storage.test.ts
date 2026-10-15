import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {scoreStore,saveSession,readSession} from '../packages/piano/storage';
import {demoScore} from './piano-fixtures';
import {PianoController} from '../packages/piano/controller';
import {PianoTestAudio} from './piano-fixtures';
it('persists original score and session, restores part/range/speed/mode/position without autoplay',async()=>{
 const score=demoScore();await scoreStore.put({id:score.id,songId:'song-a',xml:score.xml,format:score.format,title:score.title,savedAt:new Date().toISOString()});expect((await scoreStore.get(score.id))?.xml).toBe(score.xml);
 const part=score.parts[0];saveSession(score.id,{partId:part.id,trackId:part.tracks[0].id,range:{startMeasureId:part.measures[4].id,endMeasureId:part.measures[7].id},mode:'wait',speed:.75,loop:false,labels:'solfege',tick:part.measures[5].tick,practicedAt:'2026-10-15'});
 const audio=new PianoTestAudio(),c=new PianoController(audio);c.load(score,undefined,undefined,readSession(score.id));expect(c.getSnapshot()).toMatchObject({range:[4,7],mode:'wait',speed:.75,loop:false,phase:'ready',tick:9600});expect(audio.calls).toHaveLength(0);c.dispose();
});
it('corrupt or unexpected persisted values do not crash practice recovery',()=>{localStorage.setItem('anisong:piano:bad','{');expect(readSession('bad')).toBeUndefined();localStorage.setItem('anisong:piano:bad','{"mode":"unknown"}');expect(readSession('bad')).toBeUndefined();});
