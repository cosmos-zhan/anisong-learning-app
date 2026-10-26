export function neteaseCookie(value?:string):string;
export function neteaseResponseCookie(response:Response):string;
export function withNativeNeteaseCookies<T extends Response>(response:T,values:readonly string[]):T;
