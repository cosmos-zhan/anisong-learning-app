export type NeteaseAudioFormat='mp3'|'flac'|'m4a'|'aac';
export const audioFormats:Record<NeteaseAudioFormat,{mime:string;extension:string;label:string}>;
export function detectAudioFormat(bytes:Uint8Array):NeteaseAudioFormat|null;
