"""Exercise the metadata-only DCO job with an in-memory GitHub API fixture."""
import contextlib
import io
import json
import os
from pathlib import Path
import textwrap
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = (ROOT / '.github/workflows/dco.yml').read_text()
CODE = textwrap.dedent(WORKFLOW.split("python3 - <<'PYTHON'\n", 1)[1].rsplit('          PYTHON', 1)[0])


def commit(message='Subject\n\nSigned-off-by: Contributor <contributor@example.com>', sha='a' * 40):
    return {'sha': sha, 'commit': {'author': {'name': 'Contributor', 'email': 'contributor@example.com'}, 'message': message}}


class DcoWorkflowTests(unittest.TestCase):
    def run_job(self, commits, count=None, head=None):
        env = {'GH_TOKEN': 'fixture-only', 'PR_NUMBER': '1', 'GITHUB_REPOSITORY': 'fixture/repo', 'GITHUB_API_URL': 'https://api.github.com'}
        pages = [commits[i:i + 100] for i in range(0, len(commits), 100)]
        responses = [io.BytesIO(json.dumps({'commits': len(commits) if count is None else count, 'head': {'sha': head or commits[-1]['sha']}}).encode())] + [io.BytesIO(json.dumps(page).encode()) for page in pages]
        with patch.dict(os.environ, env, clear=True), patch('urllib.request.urlopen', side_effect=responses) as api, contextlib.redirect_stdout(io.StringIO()):
            exec(compile(CODE, 'dco-workflow', 'exec'), {})
        return api

    def test_matching_author_trailer_passes_without_checkout(self):
        api = self.run_job([commit()])
        self.assertEqual(api.call_count, 2)
        self.assertNotIn('actions/checkout', WORKFLOW)
        self.assertNotIn('pull_request_target', WORKFLOW)

    def test_unsigned_commit_fails(self):
        with self.assertRaises(SystemExit): self.run_job([commit('Subject')])

    def test_another_person_cannot_certify_author(self):
        with self.assertRaises(SystemExit): self.run_job([commit('Subject\n\nSigned-off-by: Someone <other@example.com>')])

    def test_quoted_signoff_in_body_is_not_a_trailer(self):
        with self.assertRaises(SystemExit): self.run_job([commit('Subject\n\nSigned-off-by: Contributor <contributor@example.com>\n\nThis is a quote, not my certification.')])

    def test_another_conventional_trailer_can_follow(self):
        self.run_job([commit('Subject\n\nSigned-off-by: Contributor <contributor@example.com>\nReviewed-by: Reviewer <reviewer@example.com>')])

    def test_all_pages_and_all_authors_are_checked(self):
        commits = [commit(sha=f'{i:040x}') for i in range(101)]
        self.assertEqual(self.run_job(commits).call_count, 3)
        commits[0] = commit('Unsigned', sha='0' * 40)
        with self.assertRaises(SystemExit): self.run_job(commits)

    def test_changed_head_and_truncated_results_fail(self):
        with self.assertRaises(SystemExit): self.run_job([commit()], head='b' * 40)
        with self.assertRaises(SystemExit): self.run_job([commit()], count=2)

    def test_unverifiable_large_pr_fails_before_commit_pagination(self):
        with self.assertRaises(SystemExit): self.run_job([commit()], count=251)


if __name__ == '__main__': unittest.main()
