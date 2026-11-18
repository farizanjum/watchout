"""Render a reviewed edit manifest; no automatic highlight or quote claims."""
import argparse,hashlib,json,math,shutil,subprocess
from pathlib import Path

def run(cmd,cwd):
    r=subprocess.run(cmd,cwd=cwd,capture_output=True,text=True)
    if r.returncode:
        (cwd/'ffmpeg_error.log').write_text(r.stderr,encoding='utf8')
        raise RuntimeError('FFmpeg failed; see '+str(cwd/'ffmpeg_error.log'))
    return r

def probe(p):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)],text=True))

def validate(m):
    fps=m.get('fps',25);eps=1/fps+.001
    keeps=m['keep'];parts=m['parts']
    if not keeps or not parts:raise ValueError('Empty timeline')
    duration=sum(b-a for a,b in keeps)
    if abs(duration-m['duration'])>eps:raise ValueError('Duration does not equal kept intervals')
    last=-1
    for a,b in keeps:
        if a<last-eps or b<=a:raise ValueError('Kept intervals must be positive, ordered, and nonoverlapping')
        last=b
    # Verify a real interval partition, not merely an equal total duration.
    pi=0
    for a,b in keeps:
        cursor=a
        while pi<len(parts) and parts[pi]['source_start']<b-eps/2:
            p=parts[pi]
            if abs(p['source_start']-cursor)>eps or p['source_end']>b+eps or p['source_end']<=p['source_start']:raise ValueError('Parts do not exactly partition kept intervals')
            if p['mode'] not in ['solo','split']:raise ValueError('Unknown layout mode')
            if len(p['rects'])!=(2 if p['mode']=='split' else 1):raise ValueError('Wrong number of crop rectangles')
            if 'fit_regions' in p and (p['mode']!='split' or len(p['fit_regions'])!=2 or any(type(v) is not bool for v in p['fit_regions'])):raise ValueError('fit_regions requires two boolean flags in a split layout')
            for w,h,x,y in p['rects']:
                if min(w,h)<=0 or min(x,y)<0 or x+w>m.get('source_width',3840)+1 or y+h>m.get('source_height',2160)+1:raise ValueError('Crop is outside source dimensions')
            cursor=p['source_end'];pi+=1
        if abs(cursor-b)>eps:raise ValueError('Missing kept video frames')
    if pi!=len(parts):raise ValueError('Extra timeline parts')

def render(a):
    from review_subjects import validate_subjects
    m=json.loads(a.manifest.read_text(encoding='utf8'));validate(m);validate_subjects(m)
    info=probe(a.source);video=next(s for s in info['streams'] if s['codec_type']=='video')
    if not any(s['codec_type']=='audio' for s in info['streams']):raise ValueError('Source has no audio')
    sw,sh=video['width'],video['height'];mw,mh=m.get('source_width',3840),m.get('source_height',2160)
    fps=m.get('fps',25);start=m.get('start',0);duration=m['duration']
    if start+max(b for _,b in m['keep'])>float(info['format']['duration'])+.1:raise ValueError('Edit exceeds source duration')
    job=a.work_dir/(m['id']+'_'+m['slug']);job.mkdir(parents=True,exist_ok=True)
    for name in ['vertical.ass','horizontal.ass']:
        src=a.manifest.parent/name
        if not src.exists():raise FileNotFoundError('Missing caption file '+str(src))
        shutil.copy2(src,job/name)
    if a.fonts_dir:
        fonts=job/'fonts';fonts.mkdir(exist_ok=True)
        for f in a.fonts_dir.iterdir():
            if f.suffix.lower() in ['.ttf','.otf']:shutil.copy2(f,fonts/f.name)
    encoder=a.encoder
    if encoder=='auto':
        test=subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=s=128x128:d=0.1','-c:v','h264_nvenc','-f','null','-'],capture_output=True)
        encoder='h264_nvenc' if test.returncode==0 else 'libx264'
    enc=['-c:v',encoder]+(['-preset','p5','-cq','18'] if encoder=='h264_nvenc' else ['-preset','medium','-crf','18'])+['-pix_fmt','yuv420p','-r',str(fps)]
    base=['ffmpeg','-v','error','-nostdin','-y','-threads','2']
    identity=[str(a.source.resolve()),a.source.stat().st_size,a.source.stat().st_mtime_ns]
    def rect(r):
        w,h,x,y=r
        w=max(2,round(w*sw/mw/2)*2);h=max(2,round(h*sh/mh/2)*2)
        x=max(0,min(sw-w,round(x*sw/mw/2)*2));y=max(0,min(sh-h,round(y*sh/mh/2)*2))
        return ':'.join(map(str,[w,h,x,y]))
    results=[]
    for vertical in ([True,False] if a.format=='both' else [a.format=='vertical']):
        destdir=a.output_dir/('vertical_9x16' if vertical else 'landscape_16x9');destdir.mkdir(parents=True,exist_ok=True)
        dest=destdir/f'{m["id"]}_{m["slug"]}.mp4';tmp=dest.with_name(dest.stem+'.rendering.mp4')
        if vertical:
            files=[]
            for p in m['parts']:
                digest=hashlib.sha256(json.dumps([identity,start,p,encoder,fps,sw,sh],sort_keys=True).encode()).hexdigest()[:20]
                part=job/f'part_{digest}.mp4';files.append(part)
                if part.exists() and part.stat().st_size>10000:continue
                if p['mode']=='split':
                    filters=['[0:v]split=2[a][b]']
                    for index,label in enumerate(['a','b']):
                        crop=rect(p['rects'][index])
                        if p.get('fit_regions',[False,False])[index]:
                            # Preserve the complete moving facecam; never stretch it to a portrait panel.
                            filters.extend([f'[{label}]crop={crop},split=2[{label}bg][{label}fg]',f'[{label}bg]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,boxblur=16:2,setsar=1[{label}blur]',f'[{label}fg]scale=1080:960:force_original_aspect_ratio=decrease,setsar=1[{label}fit]',f'[{label}blur][{label}fit]overlay=(W-w)/2:(H-h)/2,setsar=1[{label}o]'])
                        else:filters.append(f'[{label}]crop={crop},scale=1080:960:flags=lanczos,setsar=1[{label}o]')
                    filters.append('[ao][bo]vstack=2[v]');flt=';'.join(filters)
                else:flt=f'[0:v]crop={rect(p["rects"][0])},scale=1080:1920:flags=lanczos,setsar=1[v]'
                pending=part.with_name(part.stem+'.rendering.mp4')
                run(base+['-ss',str(start+p['source_start']),'-i',str(a.source),'-t',str(p['source_end']-p['source_start']),'-filter_complex_threads','1','-filter_complex',flt,'-map','[v]','-an']+enc+[str(pending)],job)
                pending.replace(part)
            listing=job/'parts.txt';listing.write_text('\n'.join("file '"+p.as_posix().replace("'","'\\''")+"'" for p in files),encoding='utf8')
            af=[];labs=[]
            for i,(s,e) in enumerate(m['keep']):af.append(f'[1:a]atrim=start={s}:end={e},asetpts=PTS-STARTPTS[a{i}]');labs.append(f'[a{i}]')
            af.append(''.join(labs)+f'concat=n={len(labs)}:v=0:a=1,alimiter=limit=0.95:level=false[a]')
            cmd=base+['-f','concat','-safe','0','-i',str(listing),'-ss',str(start),'-i',str(a.source),'-filter_complex_threads','1','-filter_complex',';'.join(af),'-vf',"ass=vertical.ass:fontsdir=fonts",'-map','0:v','-map','[a]']
        else:
            flt=[];labs=[]
            for i,(s,e) in enumerate(m['keep']):
                flt.extend([f'[0:v]trim=start={s}:end={e},setpts=PTS-STARTPTS,scale=1920:1080:flags=lanczos,setsar=1[v{i}]',f'[0:a]atrim=start={s}:end={e},asetpts=PTS-STARTPTS[a{i}]']);labs.append(f'[v{i}][a{i}]')
            flt.append(''.join(labs)+f'concat=n={len(labs)}:v=1:a=1[v][a]');flt.append('[v]ass=horizontal.ass:fontsdir=fonts[vo]');flt.append('[a]alimiter=limit=0.95:level=false[ao]')
            cmd=base+['-ss',str(start),'-i',str(a.source),'-filter_complex_threads','1','-filter_complex',';'.join(flt),'-map','[vo]','-map','[ao]']
        run(cmd+enc+['-c:a','aac','-b:a','192k','-t',str(duration),'-movflags','+faststart',str(tmp)],job)
        check=probe(tmp);vs=next(s for s in check['streams'] if s['codec_type']=='video')
        expected=(1080,1920) if vertical else (1920,1080)
        if (vs['width'],vs['height'])!=expected or abs(float(check['format']['duration'])-duration)>.12:raise RuntimeError('Rendered output failed dimensions/duration checks')
        if not any(s['codec_type']=='audio' for s in check['streams']):raise RuntimeError('Rendered output lost audio')
        decoded=run(['ffmpeg','-v','error','-threads','2','-i',str(tmp),'-f','null','-'],job)
        if decoded.stderr.strip():raise RuntimeError('Output reported errors during full decoding: '+decoded.stderr[-400:])
        tmp.replace(dest);results.append(str(dest));print('Verified render:',dest,flush=True)
    (job/'render_receipt.json').write_text(json.dumps({'outputs':results,'source':str(a.source),'manifest':str(a.manifest),'encoder':encoder,'checks':['dimensions','duration','audio stream','full decode']},indent=2),encoding='utf8')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',required=True,type=Path);p.add_argument('--manifest',required=True,type=Path);p.add_argument('--output-dir',required=True,type=Path);p.add_argument('--work-dir',required=True,type=Path);p.add_argument('--fonts-dir',type=Path);p.add_argument('--format',choices=['both','vertical','landscape'],default='both');p.add_argument('--encoder',choices=['auto','h264_nvenc','libx264'],default='auto')
    a=p.parse_args()
    for name in ['source','manifest','output_dir','work_dir','fonts_dir']:
        if getattr(a,name,None) is not None:setattr(a,name,getattr(a,name).resolve())
    render(a)
