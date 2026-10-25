import { unzipSync } from 'fflate';
import { parseCatalog, saveSongMaterials, type DownloadProgress } from './downloads';
const MAX_ZIP = 36 * 1024 * 1024;
const MAX_EXPANDED = 35 * 1024 * 1024;
const BASE = 'https://offline-package.invalid/';
const filename = (name: string) => !!name && !['.','..','__proto__','constructor','prototype'].includes(name) && !/[\\/:?#%\u0000-\u001f]/.test(name);
export async function importMediaPackage(file: Pick<File,'name'|'size'|'arrayBuffer'>, signal: AbortSignal, progress: (value: DownloadProgress)=>void) {
  const check = () => {if(signal.aborted)throw new DOMException('导入已取消','AbortError');};
  check();
  if(!file.size || file.size>MAX_ZIP)throw new Error('素材包为空或超过 36 MB。请按单曲分别导出。');
  progress({phase:'读取素材包',received:0,total:file.size});
  const data = new Uint8Array(await file.arrayBuffer());check();
  if(data.length!==file.size)throw new Error('素材包读取不完整，请重新选择文件。');
  const seen=new Set<string>();let expanded=0;
  let files:Record<string,Uint8Array>;
  try {
    files=unzipSync(data,{filter:info=>{
      expanded+=info.originalSize;
      if(!filename(info.name)||seen.has(info.name))throw new Error('素材包包含重复文件或不安全路径。');
      seen.add(info.name);
      if(seen.size>4||expanded>MAX_EXPANDED||info.originalSize>(info.name==='catalog.json'?512*1024:30*1024*1024))throw new Error('素材包展开后过大或文件数量超限。');
      return true;
    }});
  }catch(error){throw new Error(`素材包解压失败：${(error as Error).message}`);}
  check();
  if(!files['catalog.json'])throw new Error('这不是练习素材包：缺少 catalog.json。请选择 .anisong.zip，无需手动解压。');
  let raw;
  try {raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(files['catalog.json']));}
  catch {throw new Error('素材包目录无效，请重新下载完整文件。');}
  const catalog=parseCatalog(raw,BASE+'catalog.json');
  if(catalog.songs.length!==1)throw new Error('当前每个素材包仅支持一首歌曲。');
  const expected=new Set(['catalog.json']);
  for(const key of ['audio','lyrics','score'] as const){
    const entry=raw.songs[0][key];if(!entry)continue;
    if(typeof entry.url!=='string'||!filename(entry.url)||entry.url==='catalog.json')throw new Error('素材包只能引用包内文件，不能引用远程地址或文件夹。');
    if(!files[entry.url])throw new Error('素材包缺少目录中引用的文件，请重新下载。');
    expected.add(entry.url);
  }
  if(Object.keys(files).some(name=>!expected.has(name)))throw new Error('素材包含有目录以外的文件，请使用专用素材包。');
  const song=catalog.songs[0];
  return saveSongMaterials(song,signal,value=>progress({...value,phase:value.phase.replace('下载','读取包内')}),async (asset,report)=>{
    check();const bytes=files[decodeURIComponent(new URL(asset.url).pathname.slice(1))];
    if(!bytes)throw new Error('素材包缺少文件。');
    report(bytes.length);return bytes;
  });
}
