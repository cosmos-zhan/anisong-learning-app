export interface MediaEnv {
  MEDIA_TOKEN?: string;
  ALLOWED_ORIGINS?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}
const validToken = (value: string) => /^[A-Za-z0-9_-]{32,128}$/.test(value);
async function matches(supplied: string, expected: string) {
  const encode = new TextEncoder();
  const [a,b] = await Promise.all([supplied,expected].map(value=>crypto.subtle.digest('SHA-256',encode.encode(value))));
  const aa=new Uint8Array(a),bb=new Uint8Array(b);let difference=0;
  for(let i=0;i<aa.length;i++) difference |= aa[i]^bb[i];
  return difference===0;
}
// Every route passes through this handler, including version URLs and direct asset paths.
// Never deploy this binding without assets.run_worker_first=true.
export default {
  async fetch(request: Request, env: MediaEnv): Promise<Response> {
    const url=new URL(request.url),origin=request.headers.get('Origin');
    const allowed=new Set((env.ALLOWED_ORIGINS??'').split(',').map(s=>s.trim()).filter(Boolean));
    const headers=new Headers({'Cache-Control':'private, no-store','Vary':'Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    const reply=(status:number,message:string)=>new Response(message,{status,headers});
    if(origin && origin!==url.origin && !allowed.has(origin)) return reply(403,'Origin not allowed');
    if(origin) headers.set('Access-Control-Allow-Origin',origin);
    if(request.method==='OPTIONS') {
      const method=request.headers.get('Access-Control-Request-Method');
      const requested=(request.headers.get('Access-Control-Request-Headers')??'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
      if(!origin || !['GET','HEAD'].includes(method??'') || requested.some(h=>!['authorization','range'].includes(h))) return reply(403,'Preflight denied');
      headers.set('Access-Control-Allow-Methods','GET, HEAD');headers.set('Access-Control-Allow-Headers','Authorization, Range');
      headers.set('Access-Control-Max-Age','300');return new Response(null,{status:204,headers});
    }
    if(!['GET','HEAD'].includes(request.method)) {headers.set('Allow','GET, HEAD, OPTIONS');return reply(405,'Method not allowed');}
    const expected=env.MEDIA_TOKEN??'';
    if(!validToken(expected)) return reply(503,'Private media service is not configured');
    const authorization=request.headers.get('Authorization')??'';
    const supplied=authorization.startsWith('Bearer ')?authorization.slice(7):'';
    if(!validToken(supplied)||!await matches(supplied,expected)) {headers.set('WWW-Authenticate','Bearer');return reply(401,'Valid access code required');}
    // URL credentials, redirects and arbitrary upstream fetches are deliberately unsupported.
    if(url.search) return reply(400,'Use the Authorization header');
    if(!/^\/(?:catalog\.json|[a-f0-9]{16}-[^/]+\.(?:mp3|m4a|wav|ogg|flac|aac|lrc|mxl|musicxml|xml))$/i.test(url.pathname)) return reply(404,'Not found');
    const assetHeaders=new Headers();
    const range=request.headers.get('Range');if(range)assetHeaders.set('Range',range);
    const response=await env.ASSETS.fetch(new Request(url,{method:request.method,headers:assetHeaders,redirect:'manual'}));
    if(response.status>=300 && response.status<400) return reply(502,'Asset redirects are disabled');
    if(![200,206,304,404,416].includes(response.status)) return reply(502,'Asset service unavailable');
    for(const name of ['Content-Type','Content-Encoding','Content-Length','Content-Range','Accept-Ranges','ETag']) {
      const value=response.headers.get(name);if(value)headers.set(name,value);
    }
    headers.set('Access-Control-Expose-Headers','Content-Length, Content-Range, Accept-Ranges');
    return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
  }
};
