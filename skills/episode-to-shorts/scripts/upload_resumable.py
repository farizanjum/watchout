"""Resumable small requests preserve original bytes on unstable upload connections."""
from pathlib import Path
import concurrent.futures,hashlib,requests,time
CHUNK=131072
def assemble(url,headers,payload):
 # Immutable target keys and verified content hashes make retrying assembly safe.
 # Retry only temporary assembly/server failures; identity conflicts must stop.
 for attempt in range(3):
  try:
   response=requests.post(url,headers=headers,json=payload,timeout=(20,240))
   if response.ok:return response
   try:message=response.json().get('error','')
   except ValueError:message=''
   transient=response.status_code>=500 or (response.status_code==409 and message=='Assembly failed; retain chunks and retry')
   if not transient or attempt==2:response.raise_for_status()
  except (requests.Timeout,requests.ConnectionError):
   if attempt==2:raise
  time.sleep(2**attempt)
 raise RuntimeError('Assembly did not complete; verified chunks retained')

def upload_file(file,key,token,origin,workers=8):
 file=Path(file);size=file.stat().st_size;sha=hashlib.file_digest(file.open('rb'),'sha256').hexdigest()
 if not 0<size<=120*1024*1024:raise ValueError('Chunk assembly supports up to120MiB')
 headers={'Authorization':'Bearer '+token,'Connection':'close'}
 remote=requests.head(origin.rstrip('/')+'/media/'+key,timeout=30)
 if remote.ok and int(remote.headers.get('content-length',0))==size and remote.headers.get('x-content-sha256')==sha:return {'key':key,'size':size,'sha256':sha}
 count=(size+CHUNK-1)//CHUNK
 def part(index):
  with file.open('rb') as source:source.seek(index*CHUNK);data=source.read(CHUNK)
  digest=hashlib.sha256(data).hexdigest()
  for attempt in range(4):
   try:
    r=requests.put(origin.rstrip('/')+'/api/chunks/'+sha+'/'+str(index),headers={**headers,'Content-Type':'application/octet-stream','x-content-sha256':digest,'Content-Length':str(len(data))},data=data,timeout=(15,45))
    if r.status_code in [400,401,403,409]:raise ValueError('Chunk rejected: '+str(r.status_code))
    r.raise_for_status();return index
   except requests.RequestException:
    if attempt==3:raise RuntimeError('Chunk '+str(index)+' transfer failed; server keeps verified parts') from None
    time.sleep(attempt+1)
 with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
  futures=[pool.submit(part,i) for i in range(count)]
  try:
   for n,done in enumerate(concurrent.futures.as_completed(futures),1):
    done.result()
    if n==1 or n%16==0 or n==count:print(file.stem,'verified chunks',n,'/',count,flush=True)
  except BaseException:
   for pending in futures:pending.cancel()
   raise
 assemble(origin.rstrip('/')+'/api/assemble/'+key,headers,{'sha256':sha,'size':size,'chunkSize':CHUNK})
 remote=requests.get(origin.rstrip('/')+'/media/'+key,stream=True,timeout=90);remote.raise_for_status();digest=hashlib.sha256();received=0
 for data in remote.iter_content(1024*1024):digest.update(data);received+=len(data)
 if received!=size or digest.hexdigest()!=sha:raise RuntimeError('Final remote bytes differ from approved export')
 print('Gallery exact bytes verified:',file.stem,flush=True)
 return {'key':key,'size':size,'sha256':sha}
if __name__=='__main__':
 import argparse,json,os
 p=argparse.ArgumentParser();p.add_argument('file');p.add_argument('key');p.add_argument('--origin',required=True);p.add_argument('--token-env',default='WATCHOUT_UPLOAD_TOKEN');p.add_argument('--workers',type=int,default=8,choices=range(1,17));a=p.parse_args()
 if not a.origin.startswith('https://'):raise SystemExit('Use the HTTPS gallery origin')
 token=os.environ[a.token_env]
 print(json.dumps(upload_file(a.file,a.key,token,a.origin,a.workers)))
