import {publisherApi,isPublisherOwner} from './publisher.js';
const HTML=__HTML__;
const BRAND_ASSETS=__BRAND_ASSETS__;
const STUDIO=__STUDIO__;
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const mediaKey=p=>/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.(mp4|jpg)$/.test(p)&&!p.includes('..');
const validDate=value=>value!=null&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const newestFirst=clips=>clips.sort((a,b)=>(Date.parse(b.addedAt)||0)-(Date.parse(a.addedAt)||0)||b.id.localeCompare(a.id));
async function datedCatalog(clips,bucket){
 const dated=[];
 for(let i=0;i<clips.length;i+=6)dated.push(...await Promise.all(clips.slice(i,i+6).map(async c=>{
  const addedAt=validDate(c.addedAt);if(addedAt)return {...c,addedAt};
  const uploaded=mediaKey(c.file)?validDate((await bucket.head('clips/'+c.file))?.uploaded):null;
  return {...c,addedAt:uploaded,addedAtSource:uploaded?'media-upload':'unknown'};
 })));
 return newestFirst(dated);
}
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
 if(path.startsWith('/brand/')&&['GET','HEAD'].includes(request.method)){
  const name=path.slice(7),asset=Object.hasOwn(BRAND_ASSETS,name)?BRAND_ASSETS[name]:null;if(!asset)return new Response('Not found',{status:404});
  const bytes=Uint8Array.from(atob(asset),c=>c.charCodeAt(0));const type=name.endsWith('.png')?'image/png':name.endsWith('.svg')?'image/svg+xml':'text/plain; charset=utf-8';
  return new Response(request.method==='HEAD'?null:bytes,{headers:{'content-type':type,'content-length':String(bytes.length),'cache-control':'public,max-age=3600','x-content-type-options':'nosniff',...(url.searchParams.has('download')?{'content-disposition':'attachment; filename="'+name+'"'}:{})}});
 }
 if(path.startsWith('/api/publisher/'))return publisherApi(request,env);
 if(path==='/studio'&&request.method==='GET'){
  return new Response(STUDIO,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin'}});
 }
 if(path==='/health')return json({ok:true,storage:!!env.BUCKET});
 if(path.startsWith('/api/chunks/')&&['PUT','HEAD'].includes(request.method)){
  if(!await authorized(request,env))return json({error:'Unauthorized'},401);
  const match=/^\/api\/chunks\/([a-f0-9]{64})\/(\d{1,3})$/.exec(path);if(!match)return json({error:'Invalid chunk'},400);
  const key='staging/'+match[1]+'/'+Number(match[2]);const prior=await env.BUCKET.head(key);
  if(request.method==='HEAD')return new Response(null,{status:prior?200:404,headers:prior?{'content-length':String(prior.size),'x-content-sha256':prior.customMetadata?.sha256||''}:{}});
  const size=Number(request.headers.get('content-length')),sha=request.headers.get('x-content-sha256');
  if(!Number.isSafeInteger(size)||size<=0||size>131072||!/^[a-f0-9]{64}$/.test(sha||''))return json({error:'Invalid chunk size or hash'},400);
  if(prior)return prior.size===size&&prior.customMetadata?.sha256===sha?json({ok:true}):json({error:'Chunk differs'},409);
  await env.BUCKET.put(key,request.body,{sha256:sha,customMetadata:{sha256:sha}});return json({ok:true});
 }
 if(path.startsWith('/api/assemble/')&&request.method==='POST'){
  if(!await authorized(request,env))return json({error:'Unauthorized'},401);
  const key=path.slice('/api/assemble/'.length),body=await request.json();
  if(!mediaKey(key)||!Number.isSafeInteger(body.size)||body.size<=0||body.size>120*1024*1024||body.chunkSize!==131072||!/^[a-f0-9]{64}$/.test(body.sha256||''))return json({error:'Invalid assembly'},400);
  const prior=await env.BUCKET.head('clips/'+key);
  if(prior)return prior.size===body.size&&prior.customMetadata?.sha256===body.sha256?json({ok:true,key,size:prior.size,sha256:body.sha256}):json({error:'Immutable media key exists'},409);
  const count=Math.ceil(body.size/body.chunkSize),stream=new FixedLengthStream(body.size),writer=stream.writable.getWriter();
  const produce=(async()=>{try{for(let i=0;i<count;i++){
   const part=await env.BUCKET.get('staging/'+body.sha256+'/'+i),expected=Math.min(body.chunkSize,body.size-i*body.chunkSize);
   if(!part||part.size!==expected)throw Error('Missing or incorrect chunk');
   const reader=part.body.getReader();try{while(true){const {value,done}=await reader.read();if(done)break;await writer.write(value)}}finally{reader.releaseLock()}
  }await writer.close()}catch(error){await writer.abort(error);throw error}})();
  const upload=env.BUCKET.put('clips/'+key,stream.readable,{sha256:body.sha256,httpMetadata:{contentType:key.endsWith('.mp4')?'video/mp4':'image/jpeg'},customMetadata:{sha256:body.sha256}});
  const results=await Promise.allSettled([produce,upload]);if(results.some(r=>r.status==='rejected'))return json({error:'Assembly failed; retain chunks and retry'},409);
  const object=results[1].value;
  try{await env.BUCKET.delete(Array.from({length:count},(_,i)=>'staging/'+body.sha256+'/'+i))}catch{}
  return json({ok:true,key,size:object.size,sha256:body.sha256});
 }
 if(path==='/api/clips'&&['GET','HEAD'].includes(request.method)){
  if(request.method==='HEAD')return new Response(null,{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  const catalog=await env.BUCKET.get('catalog.json');return json(await datedCatalog(catalog?await catalog.json():[],env.BUCKET));
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
 if(path.startsWith('/api/import/')&&request.method==='POST'){
  if(!await authorized(request,env))return json({error:'Unauthorized'},401);
  const key=path.slice('/api/import/'.length);if(!mediaKey(key))return json({error:'Invalid file key'},400);
  const body=await request.json();let source;try{source=new URL(body.url)}catch{return json({error:'Invalid media URL'},400)}
  if(source.protocol!=='https:'||source.hostname!=='media.zernio.com'||source.username||source.password||source.search)return json({error:'Use a public Zernio media URL'},400);
  if(!/^[a-f0-9]{64}$/.test(body.sha256||'')||!Number.isSafeInteger(body.size)||body.size<=0||body.size>150*1024*1024)return json({error:'Verified size and SHA-256 required'},400);
  const prior=await env.BUCKET.head('clips/'+key);
  if(prior)return prior.size===body.size&&prior.customMetadata?.sha256===body.sha256?json({ok:true,key,size:prior.size,sha256:body.sha256}):json({error:'Immutable media key already exists'},409);
  const remote=await fetch(source.href,{redirect:'error',signal:AbortSignal.timeout(120000)});
  if(!remote.ok||Number(remote.headers.get('content-length'))!==body.size)return json({error:'Source media size mismatch'},409);
  const object=await env.BUCKET.put('clips/'+key,remote.body,{sha256:body.sha256,httpMetadata:{contentType:key.endsWith('.mp4')?'video/mp4':'image/jpeg'},customMetadata:{sha256:body.sha256}});
  return json({ok:true,key,size:object.size,sha256:body.sha256});
 }
 if(path==='/api/catalog'&&request.method==='PUT'){
  if(!await authorized(request,env))return json({error:'Unauthorized'},401);
  if(Number(request.headers.get('content-length'))>2*1024*1024)return json({error:'Catalog too large'},413);
  const data=await request.json();if(!Array.isArray(data)||data.length>1000)return json({error:'Invalid catalog'},400);
  const ids=new Set(),media=new Map();for(const c of data){if(!c||typeof c.id!=='string'||ids.has(c.id)||!mediaKey(c.file)||!mediaKey(c.poster)||typeof c.caption!=='string'||!c.caption.trim()||c.caption.length>2200||typeof c.title!=='string')return json({error:'Invalid clip'},400);ids.add(c.id);const video=await env.BUCKET.head('clips/'+c.file);if(!video||!await env.BUCKET.head('clips/'+c.poster))return json({error:'Upload media before publishing'},409);media.set(c.file,video)}
  const prior=await env.BUCKET.get('catalog.json');const old=prior?await prior.json():[];
  if(old.some(c=>!ids.has(c.id)))return json({error:'Existing clips must be preserved'},409);
  const byId=new Map(old.map(c=>[c.id,c])),now=new Date().toISOString(),dated=[];
  for(const c of data){
   const previous=byId.get(c.id);let addedAt=validDate(previous?.addedAt),addedAtSource=previous?.addedAtSource||'catalog';
   if(!previous){addedAt=now;addedAtSource='catalog'}
   else if(!addedAt){const object=media.get(previous.file)||await env.BUCKET.head('clips/'+previous.file);addedAt=validDate(object?.uploaded);addedAtSource=addedAt?'media-upload':'unknown'}
   dated.push({...c,addedAt,addedAtSource});
  }
  await env.BUCKET.put('catalog.json',JSON.stringify(newestFirst(dated)),{httpMetadata:{contentType:'application/json'}});return json({ok:true,count:data.length});
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
