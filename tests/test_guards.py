import copy, hashlib, json, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'skills'/'episode-to-shorts'/'scripts'))
from review_subjects import validate_subjects
from render import validate
from captions import group_words, write_ass
from verify_qa import verify

def manifest():
    return {'fps':25,'duration':2,'keep':[[0,2]],'source_width':1920,'source_height':1080,
      'subject_registry':{'host':{'role':'speaker','important':True},'guard':{'role':'security','important':False}},
      'parts':[{'source_start':0,'source_end':2,'start':0,'end':2,'mode':'solo','rects':[[600,1080,660,0]],'required_subjects':['host'],'subject_review':{'approved':True,'evidence':'Synthetic test fixture, not a real editorial approval','regions':[['host']]}}]}

class GuardTests(unittest.TestCase):
    def test_caption_phrase_does_not_mix_speakers(self):
        words=[{'start':0,'end':.2,'text':'Money,','speaker':'npc'}, {'start':.21,'end':.4,'text':'asshole-','speaker':'npc'}, {'start':.41,'end':.5,'text':'Oh,','speaker':'streamer'}, {'start':.51,'end':.7,'text':'hell.','speaker':'streamer'}]
        groups=group_words(words)
        self.assertEqual([[w['speaker'] for w in g] for g in groups],[['npc','npc'],['streamer','streamer']])

    def test_background_subject_and_missing_speaker_rejected(self):
        m=manifest();self.assertTrue(validate_subjects(m))
        m['parts'][0]['subject_review']['regions']=[['guard']]
        with self.assertRaisesRegex(ValueError,'background person'):validate_subjects(m)
        m['subject_registry']['guest']={'role':'speaker','important':True}
        m['parts'][0]['subject_review']['regions']=[['guest']]
        with self.assertRaisesRegex(ValueError,'omitted essential'):validate_subjects(m)

    def test_partition_detects_gap_even_when_lengths_sum_correctly(self):
        m=manifest();validate(m)
        first=copy.deepcopy(m['parts'][0]);second=copy.deepcopy(first)
        first.update(source_start=0,source_end=1);second.update(source_start=1.2,source_end=2.2)
        m['parts']=[first,second]
        with self.assertRaises(ValueError):validate(m)

    def test_caption_tail_does_not_overlap_next_phrase(self):
        words=[{'start':0,'end':.5,'text':'Hello.'},{'start':.51,'end':1,'text':'Again.'}]
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'v.ass';m=manifest();write_ass(m,group_words(words),p,True)
            lines=[x.split(',',9) for x in p.read_text().splitlines() if x.startswith('Dialogue: 1,')]
            self.assertEqual(lines[0][2],'0:00:00.51');self.assertEqual(lines[1][1],'0:00:00.51')

    def test_qa_gate_rejects_changed_export(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);edits=root/'edits';output=root/'outputs'
            (edits/'01').mkdir(parents=True);mp=edits/'01'/'edit.json';mp.write_text(json.dumps(manifest()))
            (output/'vertical_9x16').mkdir(parents=True);f=output/'vertical_9x16'/'01.mp4';f.write_bytes(b'fixture')
            digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
            report={'status':'pass','reviewer':'test-fixture','findings':[],'clips':[{'id':'01','verdict':'pass','evidence':['synthetic'],'manifest_sha256':digest(mp),'files':[{'path':'vertical_9x16/01.mp4','sha256':digest(f)}]}]}
            self.assertTrue(verify(report,output,edits));f.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError,'Export changed'):verify(report,output,edits)

if __name__=='__main__':unittest.main()
