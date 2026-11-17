"""Build styled ASS and portable SRT from reviewed Roman-caption words."""

import argparse,json,re

from pathlib import Path

def group_words(words):
    groups=[];current=[]
    payoff_starts={'tony','arijit','honey','r15','filmmaker','ghar','work'}
    for w in words:
        if current and w['text'].lower().strip('.,!?') in payoff_starts:
            groups.append(current);current=[]
        if current and (len(current)>=4 or len(' '.join(x['text'] for x in current))+len(w['text'])>27 or w['start']-current[-1]['end']>.38 or w['end']-current[0]['start']>1.8):
            groups.append(current);current=[]
        current.append(w)
        if w['text'].endswith(('?','!','.')):groups.append(current);current=[]
    if current:groups.append(current)
    return groups

def ass_time(t):
    n=round(t*100);return f'{n//360000}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'

def srt_time(t):
    n=round(t*1000);return f'{n//3600000:02}:{n//60000%60:02}:{n//1000%60:02},{n%1000:03}'

def write_ass(c,groups,path,vertical):
    width,height=(1080,1920) if vertical else (1920,1080)
    font=62 if vertical else 60
    lines=[f'''[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Montserrat,{font},&H00FFFFFF,&H0000FFFF,&H00101010,&H80101010,-1,0,0,0,100,100,0,0,1,5,2,5,65,65,100,1
Style: Watermark,Montserrat,32,&H35FFFFFF,&H35FFFFFF,&H50101010,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,9,45,45,45,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text''']
    if c.get('watermark'):
        mark=c['watermark'].replace('{','').replace('}','').replace('\n',' ')
        lines.append(f'Dialogue: 3,0:00:00.00,{ass_time(c["duration"])},Watermark,,0,0,0,,{{\\an9\\pos({width-48},52)}}{mark}')
    for gi,g in enumerate(groups):
        # One highlight per actual word timing; phrase remains visually stable.
        for j,w in enumerate(g):
            start=w['start'];end=(g[j+1]['start'] if j+1<len(g) else w['end']+.10)
            if gi+1<len(groups):end=min(end,groups[gi+1][0]['start'])
            if end-start<.035:continue
            mode=next((p['mode'] for p in c['parts'] if p['start']<=start<p['end']),'solo')
            y=950 if vertical and mode=='split' else (1420 if vertical else 870)
            parts=[]
            for k,item in enumerate(g):
                color=r'{\c&H0045EFFF&}' if k==j else r'{\c&H00FFFFFF&}'
                txt=item['text'].replace('{','').replace('}','')
                if k==0 and txt:txt=txt[0].upper()+txt[1:]
                parts.append(color+txt)
            text=' '.join(parts)
            anim=r'\fscx105\fscy105\t(0,90,\fscx100\fscy100)' if j==0 else ''
            lines.append(f'Dialogue: 1,{ass_time(start)},{ass_time(min(end,c["duration"]))},Caption,,0,0,0,,{{\\pos({width//2},{y}){anim}}}{text}')
    path.write_text('\n'.join(lines),encoding='utf8')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest',required=True,type=Path)
    a=p.parse_args();m=json.loads(a.manifest.read_text(encoding='utf8'))
    previous=0
    for word in m['words']:
        if not 0<=word['start']<word['end']<=m['duration']+.02 or word['start']<previous-.001:
            raise ValueError('Caption words must have valid, ordered, nonoverlapping times')
        if re.search('[\u0900-\u097f]',word['text']):raise ValueError('Romanize the reviewed Hindi words before styling Hinglish captions')
        previous=word['end']
    groups=group_words(m['words']);folder=a.manifest.parent
    for vertical in [True,False]:write_ass(m,groups,folder/('vertical.ass' if vertical else 'horizontal.ass'),vertical)
    (folder/'captions.srt').write_text('\n\n'.join(f"{i+1}\n{srt_time(g[0]['start'])} --> {srt_time(g[-1]['end'])}\n{' '.join(w['text'] for w in g)}" for i,g in enumerate(groups)),encoding='utf8')
    print('Created vertical.ass, horizontal.ass and captions.srt')
