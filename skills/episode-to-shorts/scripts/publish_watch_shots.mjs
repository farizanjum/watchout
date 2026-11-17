import {readFileSync,createReadStream,statSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
console.error('Ready for upload JSON on stdin (input is hidden).');
const config=await new Promise((resolve,reject)=>{
 let s='';const tty=process.stdin.isTTY;if(tty)process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');
 process.stdin.on('data',chunk=>{s+=chunk;if(/[\r\n]/.test(s)){if(tty)process.stdin.setRawMode(false);process.stdin.pause();try{resolve(JSON.parse(s))}catch{reject(Error('Invalid input'))}}});process.stdin.resume();
});
const {origin,token,sourceDir,seedFile,receiptFile}=config;
if(!/^https:\/\//.test(origin))throw Error('An HTTPS origin is required');
const seed=JSON.parse(readFileSync(seedFile,'utf8'));
const headers={authorization:'Bearer '+token};
const receipts=new Map();let publication=Promise.resolve();let publishedIds=new Set();
async function publishReady(){
 const ready=seed.filter(c=>receipts.has(c.file)&&receipts.has(c.poster));
 if(!ready.some(c=>!publishedIds.has(c.id)))return;
 const current=await fetch(origin+'/api/clips').then(r=>{if(!r.ok)throw Error('Cannot read catalog');return r.json()});
 const byId=new Map(current.map(c=>[c.id,c]));for(const c of ready)byId.set(c.id,c);
 const body=JSON.stringify([...byId.values()].sort((a,b)=>a.id.localeCompare(b.id)));
 const r=await fetch(origin+'/api/catalog',{method:'PUT',headers:{...headers,'content-type':'application/json','content-length':String(Buffer.byteLength(body))},body});
 if(!r.ok)throw Error('Catalog publish failed: '+r.status);
 ready.forEach(c=>publishedIds.add(c.id));console.log('Published verified clips:',ready.length,'of',seed.length);
}
async function verified(key,size,sha){receipts.set(key,{key,size,sha256:sha});publication=publication.then(publishReady);await publication}
async function upload(key,local){
 const size=statSync(local).size;const hash=createHash('sha256');for await(const c of createReadStream(local))hash.update(c);const sha=hash.digest('hex');
 const existing=await fetch(origin+'/media/'+key,{method:'HEAD'});
 if(existing.ok&&existing.headers.get('x-content-sha256')===sha&&Number(existing.headers.get('content-length'))===size){console.log('Already verified',key);await verified(key,size,sha);return}
 console.log('Uploading',key,Math.round(size/1048576)+' MiB');
 let done=false;
 for(let attempt=0;attempt<3&&!done;attempt++){
  try{
   const r=await fetch(origin+'/api/upload/'+key,{method:'PUT',headers:{...headers,'content-length':String(size),'content-type':key.endsWith('.mp4')?'video/mp4':'image/jpeg','x-content-sha256':sha},body:createReadStream(local),duplex:'half',signal:AbortSignal.timeout(1800000)});
   if(r.ok){const saved=await r.json();if(saved.size!==size||saved.sha256!==sha)throw Error('Upload verification mismatch');done=true}
   else if(r.status<500)throw Object.assign(Error('Upload rejected: '+r.status),{fatal:true});
  }catch(e){if(e.fatal||attempt===2)throw e;console.log('Retrying interrupted upload:',key)}
 }
 if(!done)throw Error('Upload retries exhausted');
 const check=await fetch(origin+'/media/'+key,{method:'HEAD'});if(!check.ok||Number(check.headers.get('content-length'))!==size||check.headers.get('x-content-sha256')!==sha)throw Error('Stored media verification failed');
 console.log('Uploaded and verified',key,size);await verified(key,size,sha);
}
const queue=seed.flatMap(c=>[[c.poster,path.join(sourceDir,'thumbnails',path.basename(c.poster))],[c.file,path.join(sourceDir,'vertical_9x16',path.basename(c.file))]]);
const concurrency=Math.max(1,Math.min(8,Number(config.concurrency)||4));
await Promise.all(Array.from({length:concurrency},async()=>{while(queue.length){const [key,local]=queue.shift();await upload(key,local)}}));
await publication;
const published=await fetch(origin+'/api/clips').then(r=>r.json());for(const c of seed){const actual=published.find(x=>x.id===c.id);if(!actual||actual.file!==c.file||actual.caption!==c.caption)throw Error('Published catalog mismatch')}
writeFileSync(receiptFile,JSON.stringify({origin,count:seed.length,uploaded:[...receipts.values()],publishedAt:new Date().toISOString()},null,2));console.log('Finished:',seed.length,'clips');
