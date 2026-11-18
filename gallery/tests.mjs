import test from 'node:test';import assert from 'node:assert/strict';
import worker,{parseRange} from './dist/server/index.js';
import {createHash} from 'node:crypto';
const checksum=b=>createHash('sha256').update(b).digest('hex');
globalThis.FixedLengthStream=class extends TransformStream{constructor(){super()}};
function chunkBucket(){const values=new Map();return {values,head:async k=>values.get(k)||null,get:async k=>{const v=values.get(k);return v?{...v,body:new Response(v.bytes).body}:null},delete:async keys=>{for(const k of keys)values.delete(k)},put:async(k,body,options={})=>{const bytes=new Uint8Array(await new Response(body).arrayBuffer());if(options.sha256&&checksum(bytes)!==options.sha256)throw Error('Checksum mismatch');const value={bytes,size:bytes.length,customMetadata:options.customMetadata};values.set(k,value);return value}}}
test('chunk uploads require authorization and reject oversized parts',async()=>{const env={UPLOAD_TOKEN:'secret',BUCKET:chunkBucket()};const path='https://test/api/chunks/'+'a'.repeat(64)+'/0';assert.equal((await worker.fetch(new Request(path,{method:'PUT',body:'x'}),env)).status,401);assert.equal((await worker.fetch(new Request(path,{method:'PUT',headers:{authorization:'Bearer secret','content-length':'131073','x-content-sha256':'a'.repeat(64)},body:'x'}),env)).status,400)});
test('resumable chunks assemble original bytes, verify hash and preserve immutable media',async()=>{
 const env={UPLOAD_TOKEN:'secret',BUCKET:chunkBucket()},bytes=new Uint8Array(131089).map((_,i)=>i%251),sha=checksum(bytes),auth={authorization:'Bearer secret'};
 for(let i=0;i<2;i++){const part=bytes.slice(i*131072,(i+1)*131072);const r=await worker.fetch(new Request('https://test/api/chunks/'+sha+'/'+i,{method:'PUT',headers:{...auth,'content-length':String(part.length),'x-content-sha256':checksum(part)},body:part}),env);assert.equal(r.status,200)}
 const assemble=(hash,size=bytes.length)=>worker.fetch(new Request('https://test/api/assemble/batch/one.mp4',{method:'POST',headers:auth,body:JSON.stringify({size,sha256:hash,chunkSize:131072})}),env);
 assert.equal((await assemble(sha)).status,200);assert.deepEqual(env.BUCKET.values.get('clips/batch/one.mp4').bytes,bytes);assert.equal(env.BUCKET.values.size,1);assert.equal((await assemble(sha)).status,200);assert.equal((await assemble('b'.repeat(64))).status,409);
});
test('missing or corrupt chunks never create a final media object',async()=>{
 for(const corrupt of [false,true]){const env={UPLOAD_TOKEN:'secret',BUCKET:chunkBucket()},sha='a'.repeat(64);if(corrupt)env.BUCKET.values.set('staging/'+sha+'/0',{bytes:new Uint8Array([1,2,3]),size:3});const r=await worker.fetch(new Request('https://test/api/assemble/batch/bad.mp4',{method:'POST',headers:{authorization:'Bearer secret'},body:JSON.stringify({size:3,sha256:sha,chunkSize:131072})}),env);assert.equal(r.status,409);assert.equal(env.BUCKET.values.has('clips/batch/bad.mp4'),false)}
});
test('assembly returns promptly when storage rejects without consuming the stream',async()=>{
 const bucket=chunkBucket(),bytes=new Uint8Array(131089),sha=checksum(bytes);
 for(let i=0;i<2;i++){const part=bytes.slice(i*131072,(i+1)*131072);bucket.values.set('staging/'+sha+'/'+i,{bytes:part,size:part.length})}
 bucket.put=async()=>{throw Error('Storage unavailable')};
 let timer;const timeout=new Promise(resolve=>{timer=setTimeout(()=>resolve('timeout'),300)});
 const result=await Promise.race([worker.fetch(new Request('https://test/api/assemble/batch/retry.mp4',{method:'POST',headers:{authorization:'Bearer secret'},body:JSON.stringify({size:bytes.length,sha256:sha,chunkSize:131072})}),{UPLOAD_TOKEN:'secret',BUCKET:bucket}),timeout]);clearTimeout(timer);
 assert.notEqual(result,'timeout');assert.equal(result.status,409);assert.equal(bucket.values.size,2);
});
test('assembly reads at most four parts concurrently and preserves byte order',async()=>{
 const bucket=chunkBucket(),bytes=new Uint8Array(131072*8+19).map((_,i)=>i%251),sha=checksum(bytes);
 for(let i=0;i<9;i++){const part=bytes.slice(i*131072,(i+1)*131072);bucket.values.set('staging/'+sha+'/'+i,{bytes:part,size:part.length})}
 const get=bucket.get;let active=0,maximum=0;
 bucket.get=async key=>{active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,3));const part=await get(key);active--;return part};
 const result=await worker.fetch(new Request('https://test/api/assemble/batch/ordered.mp4',{method:'POST',headers:{authorization:'Bearer secret'},body:JSON.stringify({size:bytes.length,sha256:sha,chunkSize:131072})}),{UPLOAD_TOKEN:'secret',BUCKET:bucket});
 assert.equal(result.status,200);assert.equal(maximum,4);assert.deepEqual(bucket.values.get('clips/batch/ordered.mp4').bytes,bytes);assert.equal(bucket.values.size,1);
});
test('longer original exports allow120MiB while bounding assembly below1000 storage reads',async()=>{
 const sha='a'.repeat(64),env={UPLOAD_TOKEN:'secret',BUCKET:{head:async()=>({size:120*1024*1024,customMetadata:{sha256:sha}})}};
 const req=size=>new Request('https://test/api/assemble/batch/long.mp4',{method:'POST',headers:{authorization:'Bearer secret'},body:JSON.stringify({size,sha256:sha,chunkSize:131072})});
 assert.equal((await worker.fetch(req(120*1024*1024),env)).status,200);assert.equal((await worker.fetch(req(120*1024*1024+1),env)).status,400);
});
test('studio is public while channel configuration and publishing remain private',async()=>{const env={ZERNIO_API_KEY:'never-expose-this-test-secret',BUCKET:{}};const studio=await worker.fetch(new Request('https://test/studio'),env);assert.equal(studio.status,200);const html=await studio.text();assert.ok(html.includes('Copy Caption'));assert.ok(!html.includes(env.ZERNIO_API_KEY));for(const path of ['config','accounts','publish']){const r=await worker.fetch(new Request('https://test/api/publisher/'+path),env);assert.equal(r.status,403)}});
test('video byte ranges support seek, suffix, and invalid requests',()=>{assert.deepEqual(parseRange('bytes=10-19',100),{offset:10,length:10});assert.deepEqual(parseRange('bytes=90-',100),{offset:90,length:10});assert.deepEqual(parseRange('bytes=-12',100),{offset:88,length:12});assert.equal(parseRange('bytes=110-',100),false);assert.equal(parseRange('bytes=20-10',100),false);assert.equal(parseRange('bytes=0-1,3-4',100),false)});
test('public upload and catalog writes require secret',async()=>{for(const path of ['/api/upload/episode/one.mp4','/api/catalog']){const r=await worker.fetch(new Request('https://test'+path,{method:'PUT',body:'x'}),{UPLOAD_TOKEN:'secret',BUCKET:{}});assert.equal(r.status,401)}});

const galleryClip=id=>({id,title:id,caption:'A caption',file:'batch/'+id+'.mp4',poster:'batch/'+id+'.jpg'});
function catalogBucket(initial,uploaded={}){let catalog=structuredClone(initial);return {read:()=>catalog,get:async key=>key==='catalog.json'?{json:async()=>structuredClone(catalog)}:null,head:async key=>({uploaded:uploaded[key]||null}),put:async(key,value)=>{assert.equal(key,'catalog.json');catalog=JSON.parse(value)}}}
test('gallery returns newest additions first, recovering legacy dates from media',async()=>{
 const bucket=catalogBucket([{...galleryClip('old'),addedAt:'2026-01-01T00:00:00Z'},galleryClip('legacy'),{...galleryClip('new'),addedAt:'2026-03-01T00:00:00Z'},galleryClip('unknown')],{'clips/batch/legacy.mp4':new Date('2026-02-01T00:00:00Z')});
 const r=await worker.fetch(new Request('https://test/api/clips'),{BUCKET:bucket});assert.equal(r.status,200);const clips=await r.json();assert.deepEqual(clips.map(c=>c.id),['new','legacy','old','unknown']);assert.equal(clips[1].addedAtSource,'media-upload');assert.equal(clips[3].addedAt,null);
});
test('catalog writes preserve first addition dates and never promote caption edits',async()=>{
 const old={...galleryClip('old'),addedAt:'2026-01-01T00:00:00.000Z',addedAtSource:'catalog'},legacy=galleryClip('legacy');
 const bucket=catalogBucket([old,legacy],{'clips/batch/legacy.mp4':new Date('2026-02-01T00:00:00Z')});const env={BUCKET:bucket,UPLOAD_TOKEN:'secret'};
 const put=data=>worker.fetch(new Request('https://test/api/catalog',{method:'PUT',headers:{authorization:'Bearer secret'},body:JSON.stringify(data)}),env);
 assert.equal((await put([{...old,caption:'Edited',addedAt:'2099-01-01T00:00:00Z'},legacy,{...galleryClip('new'),addedAt:'2000-01-01T00:00:00Z'}])).status,200);
 const saved=bucket.read();assert.deepEqual(saved.map(c=>c.id),['new','legacy','old']);assert.equal(saved[2].addedAt,old.addedAt);assert.equal(saved[1].addedAt,'2026-02-01T00:00:00.000Z');assert.ok(Math.abs(Date.now()-Date.parse(saved[0].addedAt))<5000);
 const first=saved[0].addedAt;assert.equal((await put(saved.map(({addedAt,addedAtSource,...c})=>c))).status,200);assert.equal(bucket.read()[0].addedAt,first);assert.equal(bucket.read()[2].caption,'Edited');
});

test('media import requires authentication and rejects arbitrary source hosts',async()=>{
 const req=(url,auth)=>new Request('https://test/api/import/batch/one.mp4',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer secret'}:{})},body:JSON.stringify({url,size:4,sha256:'a'.repeat(64)})});const env={UPLOAD_TOKEN:'secret',BUCKET:{}};
 assert.equal((await worker.fetch(req('https://media.zernio.com/temp/a.mp4',false),env)).status,401);
 for(const url of ['http://media.zernio.com/temp/a.mp4','https://localhost/a.mp4','https://media.zernio.com.attacker.test/a.mp4','https://media.zernio.com/temp/a.mp4?token=secret'])assert.equal((await worker.fetch(req(url,true),env)).status,400);
});
test('partial download has exact body and attachment headers',async()=>{const bytes=new Uint8Array([1,2,3,4,5]);const env={BUCKET:{head:async()=>({size:5,httpEtag:'"a"',httpMetadata:{contentType:'video/mp4'},customMetadata:{sha256:'abc'}}),get:async(key,{range})=>({body:bytes.slice(range.offset,range.offset+range.length)})}};const r=await worker.fetch(new Request('https://test/media/episode/one.mp4?download=1',{headers:{range:'bytes=1-3'}}),env);assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 1-3/5');assert.match(r.headers.get('content-disposition'),/attachment/);assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[2,3,4])});

test('brand downloads return exact files and cannot access arbitrary paths',async()=>{const r=await worker.fetch(new Request('https://test/brand/watch-out-banner.png?download=1'),{});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.match(r.headers.get('content-disposition'),/attachment/);const b=new Uint8Array(await r.arrayBuffer());assert.equal(b.length,Number(r.headers.get('content-length')));assert.deepEqual([...b.slice(0,8)],[137,80,78,71,13,10,26,10]);assert.equal((await worker.fetch(new Request('https://test/brand/nope'),{})).status,404)});
