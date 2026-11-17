import argparse,subprocess,sys
from pathlib import Path
p=argparse.ArgumentParser(description='Download the highest available source and metadata with yt-dlp.')
p.add_argument('url');p.add_argument('--work-dir',required=True,type=Path)
a=p.parse_args();a.work_dir.mkdir(parents=True,exist_ok=True)
subprocess.run([sys.executable,'-m','yt_dlp','--write-info-json','--no-write-subs','--no-write-auto-subs','--no-progress','-f','bv*+ba/b','--merge-output-format','mkv','-o',str(a.work_dir/'source.%(ext)s'),a.url],check=True)
print('Source and metadata saved to',a.work_dir.resolve())
