export function neteaseApi(request:Request,fetcher?:typeof fetch,options?:{cookie?:string;edge?:boolean;cache?:Map<string,unknown>;prepared?:(song:Record<string,unknown>)=>Promise<Record<string,unknown>|null>}):Promise<Response>;
export function resolveSongId(input:string,fetcher?:typeof fetch,signal?:AbortSignal):Promise<string>;
