const HTML=__HTML__;
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const mediaKey=p=>/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.(mp4|jpg)$/.test(p)&&!p.includes('..');
export function parseRange(value,size){
 if(!value)return null;
 const m=/^bytes=(\d*)-(\d*)$/.exec(value);if(!m||(!m[1]&&!m[2]))return false;
 let start,end;
 if(!m[1]){const suffix=Number(m[2]);if(suffix<=0)return false;start=Math.max(0,size-suffix);end=size-1}
 else{start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),size-1):size-1}
 return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start<=end&&start<size?{offset:start,length:end-start+1}:false;
}
async function authorized(req,env){const supplied=req.headers.get('authorization')||'';if(!env.UPLOAD_TOKEN)return false;const a=new TextEncoder().encode(supplied),b=new TextEncoder().encode('Bearer '+env.UPLOAD_TOKEN);if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0}
export default {async fetch(request,env){
 try{
 const url=new URL(request.url),path=decodeURIComponent(url.pathname);
 if(path==='/health')return json({ok:true,storage:!!env.BUCKET});
 if(path==='/api/clips'&&['GET','HEAD'].includes(request.method)){
  const catalog=await env.BUCKET.get('catalog.json');return new Response(request.method==='HEAD'?null:(catalog?.body||'[]'),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})
 }
 if(path.startsWith('/api/upload/')&&request.method==='PUT'){
  if(!await authorized(request,env))return json({error:'Unauthorized'},401);
  const key=path.slice('/api/upload/'.length);if(!mediaKey(key))return json({error:'Invalid file key'},400);
  const size=Number(request.headers.get('content-length'));if(!Number.isSafeInteger(size)||size<=0||size>150*1024*1024)return json({error:'Invalid content length'},400);
  const sha=request.headers.get('x-content-sha256');if(!/^[a-f0-9]{64}$/.test(sha||''))return json({error:'SHA-256 required'},400);
  const type=key.endsWith('.mp4')?'video/mp4':'image/jpeg';
  const object=await env.BUCKET.put('clips/'+key,request.body,{sha256:sha,httpMetadata:{contentType:type},customMetadata:{sha256:sha}});
  return json({ok:true,key,size:object.size,sha256:sha});
 }
 if(path==='/api/catalog'&&request.method==='PUT'){
  if(!await authorized(request,env))return json({error:'Unauthorized'},401);
  if(Number(request.headers.get('content-length'))>2*1024*1024)return json({error:'Catalog too large'},413);
  const data=await request.json();if(!Array.isArray(data)||data.length>1000)return json({error:'Invalid catalog'},400);
  const ids=new Set();for(const c of data){if(!c||typeof c.id!=='string'||ids.has(c.id)||!mediaKey(c.file)||!mediaKey(c.poster)||typeof c.caption!=='string'||!c.caption.trim()||c.caption.length>2200||typeof c.title!=='string')return json({error:'Invalid clip'},400);ids.add(c.id);if(!await env.BUCKET.head('clips/'+c.file)||!await env.BUCKET.head('clips/'+c.poster))return json({error:'Upload media before publishing'},409)}
  const prior=await env.BUCKET.get('catalog.json');const old=prior?await prior.json():[];
  if(old.some(c=>!ids.has(c.id)))return json({error:'Existing clips must be preserved'},409);
  await env.BUCKET.put('catalog.json',JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});return json({ok:true,count:data.length});
 }
 if(path.startsWith('/media/')&&['GET','HEAD'].includes(request.method)){
  const key=path.slice(7);if(!mediaKey(key))return new Response('Not found',{status:404});
  const meta=await env.BUCKET.head('clips/'+key);if(!meta)return new Response('Not found',{status:404});
  const headers=new Headers({'content-type':meta.httpMetadata?.contentType||'application/octet-stream','accept-ranges':'bytes','etag':meta.httpEtag,'x-content-sha256':meta.customMetadata?.sha256||'','cache-control':'public,max-age=3600','x-content-type-options':'nosniff'});
  if(url.searchParams.has('download'))headers.set('content-disposition','attachment; filename="'+key.split('/').pop()+'"');
  const range=parseRange(request.headers.get('range'),meta.size);
  if(range===false){headers.set('content-range','bytes */'+meta.size);return new Response(null,{status:416,headers})}
  headers.set('content-length',String(range?range.length:meta.size));if(range)headers.set('content-range',`bytes ${range.offset}-${range.offset+range.length-1}/${meta.size}`);
  const object=request.method==='HEAD'?null:await env.BUCKET.get('clips/'+key,range?{range}:{});
  return new Response(object?.body||null,{status:range?206:200,headers});
 }
 if(path==='/'&&['GET','HEAD'].includes(request.method))return new Response(request.method==='HEAD'?null:HTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'}});
 return new Response('Not found',{status:404});
 }catch{return json({error:'Unable to complete request'},500)}
}};
