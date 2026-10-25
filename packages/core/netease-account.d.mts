export function neteaseCookie(value?:string):string;
export function neteaseResponseCookie(response:Response):string;
export function neteaseAccountRequest(action:string,input?:Record<string,string>,signal?:AbortSignal,cookie?:string):Promise<{url:string;init:RequestInit}>;
export function readNeteaseAccount(response:Response):Promise<{data:Record<string,unknown>;cookie:string}>;
export function accountSummary(data:unknown):{loggedIn:boolean;nickname?:string;userId?:string};
