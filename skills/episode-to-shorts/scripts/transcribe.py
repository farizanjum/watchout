import argparse,os,json,subprocess,time
from pathlib import Path
import requests

def main():
    p=argparse.ArgumentParser(description='Transcribe source media with cached raw responses and word timestamps.')
    p.add_argument('source',type=Path);p.add_argument('--out-dir',required=True,type=Path);p.add_argument('--engine',choices=['scribe','groq'],default='scribe');p.add_argument('--language',default='auto')
    a=p.parse_args();a.out_dir.mkdir(parents=True,exist_ok=True)
    identity={'source':str(a.source.resolve()),'size':a.source.stat().st_size,'mtime_ns':a.source.stat().st_mtime_ns,'engine':a.engine,'language':a.language}
    identity_path=a.out_dir/'source_identity.json'
    if identity_path.exists() and json.loads(identity_path.read_text(encoding='utf8'))!=identity:
        raise ValueError('This transcript directory belongs to a different source or ASR setting; choose a new --out-dir.')
    identity_path.write_text(json.dumps(identity,indent=2),encoding='utf8')
    audio=a.out_dir/'audio.mp3'
    if not audio.exists():subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-i',str(a.source),'-vn','-ac','1','-ar','16000','-b:a','64k',str(audio)],check=True)
    duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(audio)],text=True))
    chunk_seconds=duration if a.engine=='scribe' else 300
    key_name='ELEVENLABS_API_KEY' if a.engine=='scribe' else 'GROQ_API_KEY'
    key=os.environ.get(key_name)
    if not key:raise RuntimeError(f'{key_name} is not configured in the environment.')
    words=[];raw=[];offset=0;index=0
    while offset<duration-.05:
        cache=a.out_dir/f'raw_{a.engine}_{index:03}.json'
        if cache.exists():data=json.loads(cache.read_text(encoding='utf8'))
        else:
            piece=audio
            if a.engine=='groq':
                piece=a.out_dir/f'chunk_{index:03}.mp3'
                subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-ss',str(offset),'-i',str(audio),'-t',str(chunk_seconds),'-c','copy',str(piece)],check=True)
            params={'model_id':'scribe_v2','tag_audio_events':'true','diarize':'true','timestamps_granularity':'word'} if a.engine=='scribe' else {'model':'whisper-large-v3','response_format':'verbose_json','timestamp_granularities[]':['word','segment'],'temperature':'0'}
            if a.language!='auto':params['language_code' if a.engine=='scribe' else 'language']=a.language
            endpoint='https://api.elevenlabs.io/v1/speech-to-text' if a.engine=='scribe' else 'https://api.groq.com/openai/v1/audio/transcriptions'
            headers={'xi-api-key':key} if a.engine=='scribe' else {'Authorization':'Bearer '+key}
            for attempt in range(4):
                with piece.open('rb') as f:r=requests.post(endpoint,headers=headers,data=params,files={'file':(piece.name,f,'audio/mpeg')},timeout=1200 if a.engine=='scribe' else 240)
                if r.ok:break
                if r.status_code not in [429,500,502,503]:raise RuntimeError(f'{a.engine} transcription failed: HTTP {r.status_code}; check account/API response securely.')
                time.sleep(min(60,15*(attempt+1)))
            r.raise_for_status();data=r.json();cache.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
        raw.append(str(cache.name))
        for w in data.get('words',[]):
            if w.get('type','word')!='word':continue
            words.append({'start':w['start']+offset,'end':w['end']+offset,'text':w.get('text',w.get('word','')),'speaker_id':w.get('speaker_id')})
        offset+=chunk_seconds;index+=1;print('Transcribed chunk',index,flush=True)
    result={'source':str(a.source.resolve()),'engine':a.engine,'duration':duration,'raw_files':raw,'words':words}
    (a.out_dir/'transcript.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    print('Saved',a.out_dir/'transcript.json')

if __name__=='__main__':main()
