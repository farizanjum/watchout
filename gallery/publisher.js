const PUBLISHER_CONFIG='publisher/config.enc.json';
const providerBase='https://zernio.com/api/v1';
const pubJson=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export function isPublisherOwner(req,env){
 return env.AUTH_PROVIDER==='chatgpt-sites'&&!!env.PUBLISHER_OWNER_EMAIL&&!!req.headers.get('oai-authenticated-user-id')&&req.headers.get('oai-authenticated-user-email')?.toLowerCase()===env.PUBLISHER_OWNER_EMAIL.toLowerCase();
}
const encode64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
async function cipherKey(env){if(!/^[a-f0-9]{64}$/.test(env.PUBLISHER_CIPHER_KEY||''))throw Error('Publisher encryption is not configured');return crypto.subtle.importKey('raw',Uint8Array.from(env.PUBLISHER_CIPHER_KEY.match(/../g),v=>parseInt(v,16)),{name:'AES-GCM'},false,['encrypt','decrypt'])}
export async function sealConfig(config,env){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('watchout-zernio-v1')},await cipherKey(env),new TextEncoder().encode(JSON.stringify(config)));return {v:1,iv:encode64(iv),data:encode64(data)}}
async function readConfig(env){const obj=await env.BUCKET.get(PUBLISHER_CONFIG);if(!obj)return env.ZERNIO_API_KEY?{apiKey:env.ZERNIO_API_KEY,channel:env.ZERNIO_CHANNEL_ID?{id:env.ZERNIO_CHANNEL_ID,name:env.ZERNIO_CHANNEL_NAME||env.ZERNIO_CHANNEL_ID,url:env.ZERNIO_CHANNEL_URL||null}:null}:null;const encrypted=await obj.json();const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(encrypted.iv),additionalData:new TextEncoder().encode('watchout-zernio-v1')},await cipherKey(env),decode64(encrypted.data));const config=JSON.parse(new TextDecoder().decode(raw));return config.disabled?null:config}
async function saveConfig(config,env){await env.BUCKET.put(PUBLISHER_CONFIG,JSON.stringify(await sealConfig(config,env)),{httpMetadata:{contentType:'application/json'}})}
async function provider(apiKey,path,options={},transport=fetch){
 const r=await transport(providerBase+path,{...options,headers:{authorization:'Bearer '+apiKey,'content-type':'application/json',...options.headers},signal:AbortSignal.timeout(120000)});
 let data;try{data=await r.json()}catch{data={}}
 return {status:r.status,ok:r.ok,data,retryAfter:r.headers.get('retry-after')};
}
async function youtubeAccounts(key,transport){const result=await provider(key,'/accounts?platform=youtube&excludeHidden=true',{},transport);if(!result.ok)throw Object.assign(Error('Unable to read YouTube channels. Check the API key and its permissions.'),{status:result.status===401?400:502});const list=result.data.accounts||result.data.data?.accounts;if(!Array.isArray(list))throw Error('Unexpected channel response');return list.filter(a=>a.platform==='youtube'&&a.isActive!==false&&a.enabled!==false&&!a.needsReconnection).map(a=>({id:a._id,name:a.displayName||a.metadata?.profileData?.displayName||(a.username&&a.username!=='youtube_user'?a.username:null)||'YouTube · '+(a.platformUserId||a._id),username:a.username||'',url:safeVideoUrl(a.profileUrl)}))}
async function readBody(req){const raw=await req.text();if(raw.length>16000)throw Object.assign(Error('Request too large'),{status:413});try{return JSON.parse(raw)}catch{throw Object.assign(Error('Invalid JSON'),{status:400})}}
export function validatePublishInput(input){if(typeof input.clipId!=='string'||!input.clipId||input.clipId.length>160)throw Error('Choose a clip');if(typeof input.title!=='string'||!input.title.trim()||[...input.title].length>100||/[<>]/.test(input.title))throw Error('Title must be 1–100 characters without angle brackets');if(typeof input.caption!=='string'||!input.caption.trim()||[...input.caption].length>5000||/[<>]/.test(input.caption))throw Error('Caption must be 1–5000 characters without angle brackets');if(!['public','unlisted','private'].includes(input.visibility))throw Error('Choose visibility');if(typeof input.madeForKids!=='boolean'||typeof input.containsSyntheticMedia!=='boolean')throw Error('Review the audience and synthetic-media settings');if(input.confirm!==true)throw Error('Review and confirm before publishing')}
const hashText=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
async function recordKey(accountId,clipId){return 'publisher/posts/'+await hashText(accountId+'\n'+clipId)+'.json'}
function safeVideoUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&['www.youtube.com','youtube.com','youtu.be'].includes(u.hostname)?u.href:null}catch{return null}}
function postSummary(result){const p=result.post||result.data?.post||{};const target=p.platforms?.find(x=>x.platform==='youtube')||{};return {postId:p._id||result.postId||null,status:target.status||p.status||'pending',videoUrl:safeVideoUrl(target.platformPostUrl),errorCode:typeof target.errorCategory==='string'?target.errorCategory.slice(0,100):null}}
const receiptView=r=>({clipId:r.clipId,status:r.status,postId:r.postId||null,videoUrl:r.videoUrl||null,channel:r.channel,createdAt:r.createdAt,errorCode:r.errorCode||null,review:r.review,retryAllowed:!r.postId&&!['published','failed'].includes(r.status)&&Date.now()-Date.parse(r.createdAt)<23*3600000});
export async function publisherApi(req,env,transport=fetch){
 const url=new URL(req.url),path=url.pathname;
 if(path==='/api/publisher/session'&&req.method==='GET')return pubJson({owner:isPublisherOwner(req,env)});
 if(!isPublisherOwner(req,env))return pubJson({error:'Owner sign-in required'},403);
 if(req.method!=='GET'&&(req.headers.get('origin')!==url.origin||req.headers.get('x-watchout-intent')!=='owner'))return pubJson({error:'Use the owner publishing page'},403);
 try{
 if(path==='/api/publisher/config'&&req.method==='GET'){
  const c=await readConfig(env);return pubJson({configured:!!c?.apiKey,channel:c?.channel||null});
 }
 if(path==='/api/publisher/connect'&&req.method==='POST'){
  const body=await readBody(req);if(typeof body.apiKey!=='string'||body.apiKey.length<12||body.apiKey.length>2000)return pubJson({error:'Enter a valid Zernio API key'},400);
  const accounts=await youtubeAccounts(body.apiKey,transport);if(!accounts.length)return pubJson({error:'Connect an active YouTube channel in Zernio, then try again.'},400);
  await saveConfig({apiKey:body.apiKey,channel:null},env);return pubJson({accounts});
 }
 const config=await readConfig(env);
 if(path==='/api/publisher/accounts'&&req.method==='GET'){if(!config?.apiKey)return pubJson({error:'Connect Zernio first'},409);return pubJson({accounts:await youtubeAccounts(config.apiKey,transport)})}
 if(path==='/api/publisher/channel'&&req.method==='POST'){
  if(!config?.apiKey)return pubJson({error:'Connect Zernio first'},409);const body=await readBody(req);const accounts=await youtubeAccounts(config.apiKey,transport);const channel=accounts.find(a=>a.id===body.accountId);if(!channel)return pubJson({error:'Choose one of your connected YouTube channels'},400);await saveConfig({...config,channel},env);return pubJson({channel});
 }
 if(path==='/api/publisher/disconnect'&&req.method==='POST'){await saveConfig({disabled:true},env);return pubJson({ok:true})}
 if(!config?.apiKey||!config?.channel)return pubJson({error:'Connect Zernio and choose your channel first'},409);
 if(path==='/api/publisher/status'&&req.method==='GET'){
  const clipId=url.searchParams.get('clipId');if(!clipId)return pubJson({error:'Choose a clip'},400);const key=await recordKey(config.channel.id,clipId),obj=await env.BUCKET.get(key);if(!obj)return pubJson({status:'not_published'});let record=await obj.json();
  if(record.postId&&!['published','failed'].includes(record.status)){const r=await provider(config.apiKey,'/posts/'+encodeURIComponent(record.postId),{},transport);if(r.ok){record={...record,...postSummary(r.data)};await env.BUCKET.put(key,JSON.stringify(record))}}
  return pubJson(receiptView(record));
 }
 if(path==='/api/publisher/publish'&&req.method==='POST'){
  const input=await readBody(req);try{validatePublishInput(input)}catch(e){return pubJson({error:e.message},400)}
  const catalogObj=await env.BUCKET.get('catalog.json');const catalog=catalogObj?await catalogObj.json():[];const clip=catalog.find(c=>c.id===input.clipId);if(!clip)return pubJson({error:'Clip is not available'},404);
  const media=await env.BUCKET.head('clips/'+clip.file);if(!media?.customMetadata?.sha256)return pubJson({error:'Final clip is not verified'},409);
  const accounts=await youtubeAccounts(config.apiKey,transport);if(!accounts.some(a=>a.id===config.channel.id))return pubJson({error:'The selected channel needs reconnecting in Zernio'},409);
  const key=await recordKey(config.channel.id,clip.id);let obj=await env.BUCKET.get(key);let record=obj?await obj.json():null;
  if(!record){
   const review={title:input.title.trim(),caption:input.caption.trim(),visibility:input.visibility,madeForKids:input.madeForKids,containsSyntheticMedia:input.containsSyntheticMedia};
   record={clipId:clip.id,channel:config.channel,createdAt:new Date().toISOString(),status:'pending',idempotencyKey:crypto.randomUUID(),review,mediaSha256:media.customMetadata.sha256,payload:{content:review.caption,mediaItems:[{type:'video',url:url.origin+'/media/'+clip.file}],platforms:[{platform:'youtube',accountId:config.channel.id,platformSpecificData:{title:review.title,visibility:review.visibility,madeForKids:review.madeForKids,containsSyntheticMedia:review.containsSyntheticMedia}}],publishNow:true}};
   const created=await env.BUCKET.put(key,JSON.stringify(record),{onlyIf:new Headers({'If-None-Match':'*'})});
   if(!created){obj=await env.BUCKET.get(key);record=await obj.json()}
  }
  if(record.postId||['published','failed'].includes(record.status))return pubJson(receiptView(record));
  if(Date.now()-Date.parse(record.createdAt)>23*3600000)return pubJson({error:'The earlier attempt has an uncertain result. Check Zernio before making another post.'},409);
  // Retries always send the original reviewed payload and idempotency key.
  let result;try{result=await provider(config.apiKey,'/posts',{method:'POST',headers:{'Idempotency-Key':record.idempotencyKey},body:JSON.stringify(record.payload)},transport)}catch{record.status='unknown';await env.BUCKET.put(key,JSON.stringify(record));return pubJson({...receiptView(record),message:'No final response yet. Check status or safely retry the same reviewed post.'},202)}
  const summary=postSummary(result.data);
  if(summary.postId){record={...record,...summary};await env.BUCKET.put(key,JSON.stringify(record));return pubJson(receiptView(record),record.status==='published'?200:202)}
  record.status='unknown';record.errorCode=String(result.data.code||'provider_response_'+result.status).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100);await env.BUCKET.put(key,JSON.stringify(record));return pubJson({...receiptView(record),message:'Zernio has not confirmed publication. Check status before retrying.'},202);
 }
 return pubJson({error:'Not found'},404);
 }catch(e){return pubJson({error:e.status?e.message:'Unable to complete publishing setup. Try again or check the saved configuration.'},e.status||500)}
}
