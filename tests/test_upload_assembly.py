import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'skills/episode-to-shorts/scripts'))
from upload_resumable import assemble


def response(status, error=''):
    result = Mock(ok=status < 400, status_code=status)
    result.json.return_value = {'error': error}
    if status >= 400:
        result.raise_for_status.side_effect = requests.HTTPError(str(status))
    return result


class AssemblyRecoveryTests(unittest.TestCase):
    @patch('upload_resumable.time.sleep')
    @patch('upload_resumable.requests.post')
    def test_transient_assembly_recovers_with_identical_payload(self, post, sleep):
        post.side_effect = [response(409, 'Assembly failed; retain chunks and retry'), response(200)]
        payload = {'sha256': 'a' * 64, 'size': 100, 'chunkSize': 131072}
        assemble('https://example.test/api/assemble/clip.mp4', {}, payload)
        self.assertEqual(post.call_count, 2)
        self.assertEqual(post.call_args_list[0], post.call_args_list[1])

    @patch('upload_resumable.requests.post')
    def test_immutable_conflict_does_not_retry(self, post):
        post.return_value = response(409, 'Immutable media key exists')
        with self.assertRaises(requests.HTTPError):
            assemble('https://example.test/api/assemble/clip.mp4', {}, {})
        self.assertEqual(post.call_count, 1)

    @patch('upload_resumable.requests.post')
    def test_auth_failure_does_not_retry(self, post):
        post.return_value = response(403, 'Forbidden')
        with self.assertRaises(requests.HTTPError):
            assemble('https://example.test/api/assemble/clip.mp4', {}, {})
        self.assertEqual(post.call_count, 1)

    @patch('upload_resumable.time.sleep')
    @patch('upload_resumable.requests.post', side_effect=requests.Timeout)
    def test_timeout_stops_after_three_attempts(self, post, sleep):
        with self.assertRaises(requests.Timeout):
            assemble('https://example.test/api/assemble/clip.mp4', {}, {})
        self.assertEqual(post.call_count, 3)


if __name__ == '__main__':
    unittest.main()
