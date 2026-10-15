import {useCallback,useState} from 'react';
import {App} from './App';
import {PianoWorkspace} from './piano/PianoWorkspace';
import {currentSong,DEMO_SONG,rememberSong,type Song} from '../../../packages/core/song';
import {scoreHash} from '../../../packages/piano/musicxml';
export function Workspace(){
 const [module,setModule]=useState<'lyrics'|'piano'>(()=>location.hash==='#piano'?'piano':'lyrics');
 const [visited,setVisited]=useState({lyrics:module==='lyrics',piano:module==='piano'});const [song,setSong]=useState<Song>(()=>{try{return currentSong();}catch{return DEMO_SONG;}});
 const navigate=(next:'lyrics'|'piano')=>{setVisited(v=>({...v,[next]:true}));setModule(next);history.replaceState(null,'',`#${next}`);};
 const onSong=useCallback((title:string,demo:boolean)=>{setSong(previous=>{const id=demo?DEMO_SONG.id:`song-${scoreHash(title)}`;const song:Song={id,title,scoreIds:previous.id===id?previous.scoreIds:[],updatedAt:new Date().toISOString()};try{rememberSong(song);}catch{/* Metadata persistence does not prevent playback. */}return song;});},[]);
 return <div className={`workspace workspace-${module}`}><nav className="workspace-nav" aria-label="学习模块"><a href="#lyrics" onClick={e=>{e.preventDefault();navigate('lyrics');}} className="workspace-brand">♫ ANISONG</a><button aria-pressed={module==='lyrics'} onClick={()=>navigate('lyrics')}>歌词学唱</button><button aria-pressed={module==='piano'} onClick={()=>navigate('piano')}>钢琴学谱</button></nav>
  {visited.lyrics&&<div hidden={module!=='lyrics'}><App active={module==='lyrics'} onSong={onSong} onPiano={()=>navigate('piano')}/></div>}
  {visited.piano&&<div hidden={module!=='piano'}><PianoWorkspace song={song} active={module==='piano'}/></div>}
 </div>;
}
