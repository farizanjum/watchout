"""Validate a human/agent-reviewed participant map before rendering.

This checks the evidence record, not facial identity or semantic correctness.
An independent reviewer must still inspect the actual exported footage.
"""
import argparse,json
from pathlib import Path

def validate_subjects(manifest):
    registry=manifest.get('subject_registry')
    if not registry:raise ValueError('Missing subject registry: map the important participants and background people first')
    for index,part in enumerate(manifest['parts']):
        review=part.get('subject_review',{})
        if review.get('approved') is not True or not review.get('evidence'):
            raise ValueError(f'Part {index}: missing reviewed source evidence')
        regions=review.get('regions',[])
        if len(regions)!=len(part['rects']):raise ValueError(f'Part {index}: every crop needs its participant IDs')
        visible=set()
        for region in regions:
            if not region:raise ValueError(f'Part {index}: crop has no important participant')
            for person in region:
                record=registry.get(person)
                if not record:raise ValueError(f'Part {index}: unknown subject {person}')
                if not record.get('important') or record.get('role') in ['background','security','audience']:
                    raise ValueError(f'Part {index}: background person {person} selected as crop subject')
                visible.add(person)
        missing=set(part.get('required_subjects',[]))-visible
        if missing:raise ValueError(f'Part {index}: omitted essential participant(s): {sorted(missing)}')
    return True

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--manifest',required=True,type=Path);a=p.parse_args()
    m=json.loads(a.manifest.read_text(encoding='utf8'));validate_subjects(m)
    print(f'Participant map passes for {len(m["parts"])} parts; visual QA is still required.')
