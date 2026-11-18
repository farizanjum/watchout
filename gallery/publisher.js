const PUBLISHER_CONFIG='publisher/config.enc.json';
const providerBase='https://zernio.com/api/v1';
const pubJson=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export function isPublisherOwner(req,env){
 return env.AUTH_PROVIDER==='chatgpt-sites'&&!!env.PUBLISHER_OWNER_EMAIL&&!!req.headers.get('oai-authenticated-user-id')&&req.headers.get('oai-authenticated-user-email')?.toLowerCase()===env.PUBLISHER_OWNER_EMAIL.toLowerCase();
}
async function isAutomationPublisher(req,env){
 if(!env.AUTOMATION_PUBLISH_TOKEN||!env.AUTOMATION_CLIP_PREFIX||!Number.isFinite(Date.parse(env.AUTOMATION_EXPIRES_AT))||Date.parse(env.AUTOMATION_EXPIRES_AT)<=Date.now())return false;
 const supplied=req.headers.get('authorization')||'',expected='Bearer '+env.AUTOMATION_PUBLISH_TOKEN;
 if(supplied.length!==expected.length)return false;let diff=0;for(let i=0;i<expected.length;i++)diff|=supplied.charCodeAt(i)^expected.charCodeAt(i);return diff===0;
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
async function youtubeAccounts(key,transport){const result=await provider(key,'/accounts?platform=youtube&excludeHidden=true',{},transport);if(!result.ok)throw Object.assign(Error('Unable to read YouTube channels. Check the API key and its permissions.'),{status:result.status===401?400:502});const list=result.data.accounts||result.data.data?.accounts;if(!Array.isArray(list))throw Error('Unexpected channel response');return list.filter(a=>a.platform==='youtube'&&a.isActive!==false&&a.enabled!==false&&!a.needsReconnection).map(a=>({id:a._id,name:a.displayName||a.metadata?.profileData?.displayName||(a.username&&a.username!=='youtube_user'?a.username:null)||'YouTube Â· '+(a.platformUserId||a._id),username:a.username||'',url:safeVideoUrl(a.profileUrl)}))}
async function readBody(req){const raw=await req.text();if(raw.length>16000)throw Object.assign(Error('Request too large'),{status:413});try{return JSON.parse(raw)}catch{throw Object.assign(Error('Invalid JSON'),{status:400})}}
export function validatePublishInput(input){if(typeof input.clipId!=='string'||!input.clipId||input.clipId.length>160)throw Error('Choose a clip');if(typeof input.title!=='string'||!input.title.trim()||[...input.title].length>100||/[<>]/.test(input.title))throw Error('Title must be 1â€“100 characters without angle brackets');if(typeof input.caption!=='string'||!input.caption.trim()||[...input.caption].length>5000||/[<>]/.test(input.caption))throw Error('Caption must be 1â€“5000 characters without angle brackets');if(!['public','unlisted','private'].includes(input.visibility))throw Error('Choose visibility');if(typeof input.madeForKids!=='boolean'||typeof input.containsSyntheticMedia!=='boolean')throw Error('Review the audience and synthetic-media settings');if(input.confirm!==true)throw Error('Review and confirm before publishing')}

async function verifiedShort(env,id,expectedSha){
 const obj=await env.BUCKET.get('catalog.json'),catalog=obj?await obj.json():[],clip=catalog.find(c=>c.id===id);
 if(!clip)throw Object.assign(Error('Clip is not available'),{status:404});
 const media=await env.BUCKET.head('clips/'+clip.file);
 if(!/^[a-f0-9]{64}$/.test(clip.sha256||'')||clip.sha256!==media?.customMetadata?.sha256||(expectedSha&&clip.sha256!==expectedSha))throw Object.assign(Error('Clip verification changed or is missing. Recheck the final export before publishing.'),{status:409});
 if(!Number.isInteger(clip.width)||!Number.isInteger(clip.height)||clip.width<=0||clip.height<clip.width||!Number.isFinite(clip.duration)||clip.duration<=0||clip.duration>180)throw Object.assign(Error('Shorts require a verified vertical or square video up to 3 minutes. Choose a Shorts export.'),{status:409});
 return {clip,media};
}

const hashText=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
async function recordKey(accountId,clipId){return 'publisher/posts/'+await hashText(accountId+'\n'+clipId)+'.json'}
function safeVideoUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&['www.youtube.com','youtube.com','youtu.be'].includes(u.hostname)?u.href:null}catch{return null}}

export function scheduleInput(input){
 const delivery=input.delivery||'now';if(!['now','schedule'].includes(delivery))throw Error('Choose publish now or schedule');
 if(delivery==='now')return {delivery:'now'};
 const timezone=input.timezone||'Asia/Dubai';let fmt;try{fmt=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}catch{throw Error('Choose a valid timezone')}
 let when;
 if(input.localTime){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.localTime))throw Error('Choose a valid date and time');
  const parts=input.localTime.match(/\d+/g).map(Number),base=Date.UTC(parts[0],parts[1]-1,parts[2],parts[3],parts[4]);const matches=[];
  for(let offset=-840;offset<=840;offset+=15){const time=base+offset*60000;const v=Object.fromEntries(fmt.formatToParts(time).map(x=>[x.type,x.value]));if(`${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}`===input.localTime)matches.push(time)}
  if(matches.length!==1)throw Error('This local time is missing or ambiguous because of daylight saving. Choose another time.');when=matches[0];
 }else{if(typeof input.scheduledFor!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(input.scheduledFor))throw Error('Schedule needs an explicit timezone');when=Date.parse(input.scheduledFor)}
 if(!Number.isFinite(when)||when<Date.now()+300000)throw Error('Choose a time at least 5 minutes in the future');
 return {delivery:'schedule',scheduledFor:new Date(when).toISOString(),timezone};
}
function postSummary(result){
 const p=result.post||result.data?.post||{};const target=p.platforms?.find(x=>x.platform==='youtube')||{};
 const status=target.status==='published'?'published':p.status==='draft'?'cancelled':['scheduled','publishing','cancelled'].includes(p.status)?p.status:target.status||p.status||'pending';
 return {postId:p._id||result.postId||null,status,scheduledFor:status==='cancelled'?null:p.scheduledFor||null,timezone:p.timezone||'Asia/Dubai',videoUrl:safeVideoUrl(target.platformPostUrl),errorCode:typeof target.errorCategory==='string'?target.errorCategory.slice(0,100):null};
}
const manageable=r=>!!r.postId&&(r.status==='cancelled'||r.status==='scheduled'&&Date.parse(r.scheduledFor)>Date.now()+60000);
const receiptView=r=>({clipId:r.clipId,status:r.status,postId:r.postId||null,videoUrl:r.videoUrl||null,channel:r.channel,createdAt:r.createdAt,errorCode:r.errorCode||null,review:r.review,scheduledFor:r.scheduledFor||null,timezone:r.timezone||r.review?.timezone||'Asia/Dubai',revision:r.revision||r.createdAt,canManageSchedule:manageable(r),retryAllowed:!r.postId&&!['published','failed','cancelled'].includes(r.status)&&Date.now()-Date.parse(r.createdAt)<23*3600000});
async function adoptExternalPost(env,config,clipId,transport){
 const catalog=await env.BUCKET.get('catalog.json');const clip=catalog?(await catalog.json()).find(c=>c.id===clipId):null;const external=clip?.externalPublication;
 if(!external)return null;
 if(!/^[a-f0-9]{24}$/.test(external.postId||'')||external.videoSha256!==clip.sha256||clip.qa?.status!=='pass'||clip.qa.videoSha256!==clip.sha256)throw Object.assign(Error('External publication verification is incomplete'),{status:409});
 await verifiedShort(env,clipId);
 const result=await provider(config.apiKey,'/posts/'+external.postId,{},transport);const post=result.data.post||result.data.data?.post;
 const target=post?.platforms?.find(p=>p.platform==='youtube'),account=target?.accountId?._id||target?.accountId;
 if(!result.ok||account!==config.channel.id||post.content!==clip.caption)throw Object.assign(Error('External post does not match this clip and channel'),{status:409});
 const media=post.mediaItems?.find(m=>m.type==='video');let mediaUrl;try{mediaUrl=new URL(media?.url)}catch{throw Object.assign(Error('External post video is missing'),{status:409})}
 if(mediaUrl.protocol!=='https:'||mediaUrl.hostname!=='media.zernio.com')throw Object.assign(Error('External post media host is not verified'),{status:409});
 const bytes=await transport(mediaUrl.href,{redirect:'error',signal:AbortSignal.timeout(120000)});const size=Number(bytes.headers.get('content-length'));
 if(!bytes.ok||!Number.isSafeInteger(size)||size<=0||size>64*1024*1024)throw Object.assign(Error('External post media cannot be verified'),{status:409});
 const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await bytes.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');
 if(actual!==clip.sha256)throw Object.assign(Error('External post video differs from the reviewed clip'),{status:409});
 const summary=postSummary(result.data),review={title:clip.title,caption:clip.caption,visibility:target.platformSpecificData?.visibility||'public',madeForKids:false,containsSyntheticMedia:false,delivery:summary.scheduledFor?'schedule':'now',scheduledFor:summary.scheduledFor,timezone:summary.timezone};
 const record={clipId,channel:config.channel,createdAt:post.createdAt||new Date().toISOString(),revision:crypto.randomUUID(),mediaSha256:clip.sha256,review,external:true,...summary};
 const key=await recordKey(config.channel.id,clipId);const saved=await env.BUCKET.put(key,JSON.stringify(record),{onlyIf:new Headers({'If-None-Match':'*'})});return saved?record:await (await env.BUCKET.get(key)).json();
}
async function freshRecord(record,config,transport){
 const r=await provider(config.apiKey,'/posts/'+encodeURIComponent(record.postId),{},transport);
 if(!r.ok||!(r.data.post||r.data.data?.post))throw Object.assign(Error('Cannot verify the current post status. Refresh before changing it.'),{status:502});
 const post=r.data.post||r.data.data.post;const target=post.platforms?.find(p=>p.platform==='youtube');const account=target?.accountId?._id||target?.accountId;
 if(account&&account!==config.channel.id)throw Object.assign(Error('The post does not belong to the connected channel'),{status:409});
 const summary=postSummary(r.data);return {...record,...summary,review:{...record.review,...(typeof post.content==='string'?{caption:post.content}:{}),...(target?.platformSpecificData?.title?{title:target.platformSpecificData.title}:{}),...(summary.scheduledFor?{delivery:'schedule',scheduledFor:summary.scheduledFor,timezone:summary.timezone}:{})}};
}
async function scheduleLock(env,key){
 const lockKey=key+'.lock',prior=await env.BUCKET.get(lockKey);if(prior&&(await prior.json()).expiresAt>Date.now())return null;
 const result=await env.BUCKET.put(lockKey,JSON.stringify({expiresAt:Date.now()+240000}),{onlyIf:new Headers(prior?{'If-Match':prior.httpEtag}:{'If-None-Match':'*'})});return result?lockKey:null;
}
export async function publisherApi(req,env,transport=fetch){
 const url=new URL(req.url),path=url.pathname;
 if(path==='/api/publisher/session'&&req.method==='GET')return pubJson({owner:isPublisherOwner(req,env)});
 const automation=await isAutomationPublisher(req,env);
 if(!isPublisherOwner(req,env)&&!automation)return pubJson({error:'Owner sign-in required'},403);
 if(automation&&!((path==='/api/publisher/publish'&&req.method==='POST')||(path==='/api/publisher/status'&&req.method==='GET')))return pubJson({error:'Automation scope does not allow this action'},403);
 if(!automation&&req.method!=='GET'&&(req.headers.get('origin')!==url.origin||req.headers.get('x-watchout-intent')!=='owner'))return pubJson({error:'Use the owner publishing page'},403);
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

 if(path==='/api/publisher/statuses'&&req.method==='GET'){
  const obj=await env.BUCKET.get('catalog.json');const catalog=obj?await obj.json():[];const records=[];
  for(const clip of catalog){const key=await recordKey(config.channel.id,clip.id),obj=await env.BUCKET.get(key);if(!obj)continue;let record=await obj.json();if(record.postId&&(record.status==='publishing'||record.status==='scheduled'&&Date.parse(record.scheduledFor)<Date.now()+60000)){try{record=await freshRecord(record,config,transport);await env.BUCKET.put(key,JSON.stringify(record),{onlyIf:new Headers({'If-Match':obj.httpEtag})})}catch{}}records.push(receiptView(record))}return pubJson({records});
 }
 if(path==='/api/publisher/status'&&req.method==='GET'){
  if(automation&&!url.searchParams.get('clipId')?.startsWith(env.AUTOMATION_CLIP_PREFIX))return pubJson({error:'Clip is outside the authorized batch'},403);
  const clipId=url.searchParams.get('clipId');if(!clipId)return pubJson({error:'Choose a clip'},400);const key=await recordKey(config.channel.id,clipId),obj=await env.BUCKET.get(key);if(!obj){const adopted=await adoptExternalPost(env,config,clipId,transport);return pubJson(adopted?receiptView(adopted):{status:'not_published'})}let record=await obj.json();
  if(record.postId&&!['published','failed'].includes(record.status)){record=await freshRecord(record,config,transport);const saved=await env.BUCKET.put(key,JSON.stringify(record),{onlyIf:new Headers({'If-Match':obj.httpEtag})});if(!saved){const latest=await env.BUCKET.get(key);record=await latest.json()}}
  return pubJson(receiptView(record));
 }
 if(['/api/publisher/change-schedule','/api/publisher/cancel-schedule'].includes(path)&&req.method==='POST'){
  const input=await readBody(req);if(typeof input.clipId!=='string'||input.confirm!==true)return pubJson({error:'Review and confirm the schedule change'},400);
  let timing;const cancel=path.endsWith('/cancel-schedule');if(!cancel){try{validatePublishInput(input);timing=scheduleInput(input)}catch(e){return pubJson({error:e.message},400)}}
  const key=await recordKey(config.channel.id,input.clipId),lock=await scheduleLock(env,key);if(!lock)return pubJson({error:'Another change is in progress. Refresh the status.'},409);
  try{
   const obj=await env.BUCKET.get(key);if(!obj)return pubJson({error:'No scheduled post found'},404);let record=await obj.json();
   if(!input.expectedRevision||input.expectedRevision!==(record.revision||record.createdAt))return pubJson({error:'The schedule changed. Refresh before editing.'},409);
   if(!record.postId)return pubJson({error:'The original request is not confirmed yet. Check status first.'},409);
   if(!cancel)await verifiedShort(env,input.clipId,record.mediaSha256);
   record=await freshRecord(record,config,transport);
   if(!manageable(record))return pubJson({error:'This post is already publishing, published, or too close to its scheduled time to change safely.'},409);
   if(cancel&&record.status==='cancelled')return pubJson(receiptView(record));
   const review=cancel?record.review:{title:input.title.trim(),caption:input.caption.trim(),visibility:input.visibility,madeForKids:input.madeForKids,containsSyntheticMedia:input.containsSyntheticMedia,...timing};
   const body=cancel?{isDraft:true}:{isDraft:false,content:review.caption,platforms:[{platform:'youtube',accountId:config.channel.id,platformSpecificData:{title:review.title,visibility:review.visibility,madeForKids:review.madeForKids,containsSyntheticMedia:review.containsSyntheticMedia}}],...(timing.delivery==='schedule'?{scheduledFor:timing.scheduledFor,timezone:timing.timezone}:{publishNow:true})};
   let result;try{result=await provider(config.apiKey,'/posts/'+encodeURIComponent(record.postId),{method:'PUT',body:JSON.stringify(body)},transport)}catch{return pubJson({error:'The change was not confirmed. Check status before trying again.'},502)}
   if(!result.ok)return pubJson({error:'Zernio did not confirm the change. Check status before trying again.'},502);
   const summary=(result.data.post||result.data.data?.post)?postSummary(result.data):await freshRecord(record,config,transport);
   if(cancel&&summary.status!=='cancelled')return pubJson({error:'Cancellation is not confirmed. Check status before leaving.'},502);
   record={...record,...summary,review,revision:crypto.randomUUID(),updatedAt:new Date().toISOString()};await env.BUCKET.put(key,JSON.stringify(record));return pubJson(receiptView(record));
  }finally{await env.BUCKET.delete(lock)}
 }
 if(path==='/api/publisher/publish'&&req.method==='POST'){
  const input=await readBody(req);let timing;try{validatePublishInput(input);timing=scheduleInput(input)}catch(e){return pubJson({error:e.message},400)}
  if(automation&&!input.clipId.startsWith(env.AUTOMATION_CLIP_PREFIX))return pubJson({error:'Clip is outside the authorized batch'},403);
  const {clip,media}=await verifiedShort(env,input.clipId);
  if(automation&&(clip.qa?.status!=='pass'||clip.qa?.videoSha256!==clip.sha256||!/^[a-f0-9]{64}$/.test(clip.qa?.manifestSha256||'')))return pubJson({error:'This batch needs a matching final QA record before automatic publishing'},409);
  const accounts=await youtubeAccounts(config.apiKey,transport);if(!accounts.some(a=>a.id===config.channel.id))return pubJson({error:'The selected channel needs reconnecting in Zernio'},409);
  const key=await recordKey(config.channel.id,clip.id);let obj=await env.BUCKET.get(key);let record=obj?await obj.json():null;
  if(!record&&clip.externalPublication){record=await adoptExternalPost(env,config,clip.id,transport);return pubJson(receiptView(record))}
  if(!record){
   const review={title:input.title.trim(),caption:input.caption.trim(),visibility:input.visibility,madeForKids:input.madeForKids,containsSyntheticMedia:input.containsSyntheticMedia,...timing};
   record={clipId:clip.id,channel:config.channel,createdAt:new Date().toISOString(),status:'pending',revision:crypto.randomUUID(),idempotencyKey:crypto.randomUUID(),review,mediaSha256:media.customMetadata.sha256,payload:{content:review.caption,mediaItems:[{type:'video',url:url.origin+'/media/'+clip.file}],platforms:[{platform:'youtube',accountId:config.channel.id,platformSpecificData:{title:review.title,visibility:review.visibility,madeForKids:review.madeForKids,containsSyntheticMedia:review.containsSyntheticMedia}}],...(timing.delivery==='schedule'?{scheduledFor:timing.scheduledFor,timezone:timing.timezone}:{publishNow:true})}};
   const created=await env.BUCKET.put(key,JSON.stringify(record),{onlyIf:new Headers({'If-None-Match':'*'})});
   if(!created){obj=await env.BUCKET.get(key);record=await obj.json()}
  }
  if(record.mediaSha256!==clip.sha256)return pubJson({error:'The original reviewed media changed. Check its status before making another request.'},409);
  if(record.postId||['published','failed'].includes(record.status))return pubJson(receiptView(record));
  if(Date.now()-Date.parse(record.createdAt)>23*3600000)return pubJson({error:'The earlier attempt has an uncertain result. Check Zernio before making another post.'},409);
  if(record.payload.scheduledFor&&Date.parse(record.payload.scheduledFor)<Date.now()+60000)return pubJson({error:'The original scheduled time has passed or is too close. Check Zernio; this request will not be sent as an immediate post.'},409);
  // Retries always send the original reviewed payload and idempotency key.
  let result;try{result=await provider(config.apiKey,'/posts',{method:'POST',headers:{'Idempotency-Key':record.idempotencyKey},body:JSON.stringify(record.payload)},transport)}catch{record.status='unknown';await env.BUCKET.put(key,JSON.stringify(record));return pubJson({...receiptView(record),message:'No final response yet. Check status or safely retry the same reviewed post.'},202)}
  const summary=postSummary(result.data);
  if(summary.postId){record={...record,...summary};await env.BUCKET.put(key,JSON.stringify(record));return pubJson(receiptView(record),record.status==='published'?200:202)}
  record.status='unknown';record.errorCode=String(result.data.code||'provider_response_'+result.status).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100);await env.BUCKET.put(key,JSON.stringify(record));return pubJson({...receiptView(record),message:'Zernio has not confirmed publication. Check status before retrying.'},202);
 }
 return pubJson({error:'Not found'},404);
 }catch(e){return pubJson({error:e.status?e.message:'Unable to complete publishing setup. Try again or check the saved configuration.'},e.status||500)}
}
