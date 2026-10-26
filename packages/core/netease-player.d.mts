type AudioRequest={url:string;init:RequestInit};
export function encodeWeapi(value:unknown,engine?:Crypto):Promise<string>;
export function neteasePlayerRequest(id:string,signal?:AbortSignal,cookie?:string):Promise<AudioRequest>;
export function neteaseLinuxPlayerRequest(id:string,signal?:AbortSignal,arrayIds?:boolean,cookie?:string):Promise<AudioRequest>;
export function neteaseAudioRequest(id:string,kind:'download'|'player',level:'standard'|'exhigh'|'lossless',signal?:AbortSignal,cookie?:string):Promise<AudioRequest>;
