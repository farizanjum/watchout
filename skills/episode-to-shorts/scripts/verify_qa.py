"""Release gate for an independent QA report tied to exact final artifacts."""
import argparse,hashlib,json
from pathlib import Path

def digest(path):
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def verify(report,output_dir,manifest_dir):
    if report.get('status')!='pass' or not report.get('reviewer'):raise ValueError('Independent QA has not passed')
    if any(f.get('status')!='resolved' for f in report.get('findings',[])):raise ValueError('Unresolved QA findings')
    clips=report.get('clips',[])
    manifests={p.parent.name:p for p in manifest_dir.glob('*/edit.json')}
    if {c['id'] for c in clips}!=set(manifests):raise ValueError('QA report does not cover every edit manifest')
    seen=set()
    for c in clips:
        if c.get('verdict')!='pass':raise ValueError('Clip has not passed QA: '+c['id'])
        if not c.get('evidence') and not c.get('inspected_windows'):raise ValueError('Missing inspection evidence: '+c['id'])
        if digest(manifests[c['id']])!=c['manifest_sha256']:raise ValueError('Manifest changed after QA: '+c['id'])
        for item in c['files']:
            p=(output_dir/item['path']).resolve()
            if not p.is_relative_to(output_dir.resolve()):raise ValueError('QA file path leaves output directory')
            if digest(p)!=item['sha256']:raise ValueError('Export changed after QA: '+item['path'])
            seen.add(p)
    exports={p.resolve() for folder in ['vertical_9x16','landscape_16x9'] for p in (output_dir/folder).glob('*.mp4')}
    if seen!=exports:raise ValueError('QA report does not cover every final export')
    return True

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--report',required=True,type=Path);p.add_argument('--output-dir',required=True,type=Path);p.add_argument('--manifest-dir',required=True,type=Path)
    a=p.parse_args();verify(json.loads(a.report.read_text(encoding='utf8')),a.output_dir,a.manifest_dir)
    print('Independent QA passed; all final export and manifest hashes match.')
