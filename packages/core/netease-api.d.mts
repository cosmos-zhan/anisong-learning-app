export function neteaseApi(request:Request,fetcher?:typeof fetch):Promise<Response>;
export function resolveSongId(input:string,fetcher?:typeof fetch,signal?:AbortSignal):Promise<string>;
