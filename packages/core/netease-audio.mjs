// Clear audio containers only. Never rename an encrypted/provider cache to MP3.
export const audioFormats={
  mp3:{mime:'audio/mpeg',extension:'mp3',label:'MP3'},
  flac:{mime:'audio/flac',extension:'flac',label:'FLAC'},
  m4a:{mime:'audio/mp4',extension:'m4a',label:'M4A'},
  aac:{mime:'audio/aac',extension:'aac',label:'AAC'},
};
export function detectAudioFormat(bytes){
  if(bytes.length<4)return null;
  const ascii=(start,end)=>String.fromCharCode(...bytes.subarray(start,end));
  if(ascii(0,4)==='fLaC')return 'flac';
  if(bytes.length>=16&&ascii(4,8)==='ftyp'){
    const brands=ascii(8,Math.min(bytes.length,64));
    if(/M4A |M4B |mp42|isom|iso2/.test(brands))return 'm4a';
  }
  if(bytes.length>=7&&bytes[0]===255&&(bytes[1]&246)===240)return 'aac';
  if(ascii(0,3)==='ID3')return 'mp3';
  for(let i=0;i<Math.min(bytes.length-3,1024);i++){
    if(bytes[i]===255&&(bytes[i+1]&224)===224&&(bytes[i+1]&6)!==0&&
      (bytes[i+2]&240)!==0&&(bytes[i+2]&240)!==240&&(bytes[i+2]&12)!==12)return 'mp3';
  }
  return null;
}
