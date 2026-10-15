import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest

spec = importlib.util.spec_from_file_location('coverage', Path(__file__).with_name('policy-browser-coverage.py'))
coverage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(coverage)


class BrowserCoverageTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.since = time.time() - 1
        self.env = dict(RUNNER_TEMP=str(self.root), CI_POLICY_STARTED_AT=str(self.since),
                        CI_HEAD_SHA='a' * 40, GITHUB_SHA='b' * 40, GITHUB_REPOSITORY_ID='123',
                        GITHUB_RUN_ID='456', GITHUB_RUN_ATTEMPT='3', GITHUB_JOB='checks',
                        GITHUB_WORKFLOW_REF='owner/repo/.github/workflows/verify.yml@refs/pull/1/merge')
        self.policy = dict(schemaVersion=1, executionVersion=1, state='PUBLISHED', headSha='a' * 40,
                           sourceSha='b' * 40, repositoryId='123', id='published-policy', definitionHash='c' * 64,
                           checks=[dict(id='frontend.components', execution=dict(argv=['bash', '-lc', coverage.FULL_BROWSER_COMMAND]))])
        content = '<testsuites><testsuite><testcase name="actual case"/></testsuite></testsuites>'
        self.bundle = dict(schemaVersion=1, verificationScope='jobs', policyId=self.policy['id'],
                           policyHash=self.policy['definitionHash'], headSha='a' * 40, sourceSha='b' * 40,
                           repositoryId='123', runId='456', runAttempt=3, jobName='checks',
                           signerWorkflow='owner/repo/.github/workflows/verify.yml',
                           results=[dict(ruleId='frontend.components', status='passed')],
                           reports=[dict(ruleId='frontend.components', format='junit', content=content,
                                         sha256=hashlib.sha256(content.encode()).hexdigest())])
        self.policy_path = self.root / 'preflyt-policy-current' / 'policy.json'
        self.bundle_path = self.root / 'preflyt-current' / 'preflyt-results.json'

    def write(self, policy=None, bundle=None):
        for path, value in [(self.policy_path, policy if policy is not None else self.policy),
                            (self.bundle_path, bundle if bundle is not None else self.bundle)]:
            path.parent.mkdir(exist_ok=True)
            path.write_text(json.dumps(value))

    def test_reuses_only_current_complete_full_suite(self):
        self.write()
        self.assertTrue(coverage.covered(self.env))
        # Unrelated policy failures must still reach the final gate. They do not
        # require running this already-passing browser suite a second time.
        self.bundle['results'].append(dict(ruleId='secrets.scan', status='failed'))
        self.write()
        self.assertTrue(coverage.covered(self.env))

    def test_prior_attempt_commit_repository_job_policy_or_workflow_never_covers_tests(self):
        for key in ('schemaVersion', 'verificationScope', 'headSha', 'sourceSha', 'repositoryId',
                    'runId', 'runAttempt', 'jobName', 'policyId', 'policyHash', 'signerWorkflow'):
            with self.subTest(key=key):
                bundle = copy.deepcopy(self.bundle)
                bundle[key] = 'different'
                self.write(bundle=bundle)
                self.assertFalse(coverage.covered(self.env))
        for key in ('schemaVersion', 'executionVersion', 'state', 'headSha', 'sourceSha', 'repositoryId', 'id', 'definitionHash'):
            with self.subTest(policy=key):
                policy = copy.deepcopy(self.policy)
                policy[key] = 'different'
                self.write(policy=policy)
                self.assertFalse(coverage.covered(self.env))

    def test_narrowed_missing_unconfigured_or_duplicate_commands_fall_back(self):
        for argv in (['bash', '-lc', coverage.FULL_BROWSER_COMMAND + ' --changed=HEAD~1'],
                     ['pnpm', 'test'], [], None):
            policy = copy.deepcopy(self.policy)
            policy['checks'][0]['execution']['argv'] = argv
            self.write(policy=policy)
            self.assertFalse(coverage.covered(self.env))
        for checks in ([], self.policy['checks'] * 2):
            self.write(policy={**self.policy, 'checks': checks})
            self.assertFalse(coverage.covered(self.env))

    def test_missing_failed_incomplete_or_duplicate_reports_fall_back(self):
        for status in ('failed', 'incomplete', None):
            bundle = copy.deepcopy(self.bundle)
            bundle['results'][0]['status'] = status
            self.write(bundle=bundle)
            self.assertFalse(coverage.covered(self.env))
        for field in ('results', 'reports'):
            for count in (0, 2):
                bundle = copy.deepcopy(self.bundle)
                bundle[field] *= count
                self.write(bundle=bundle)
                self.assertFalse(coverage.covered(self.env))

    def test_report_digest_failures_skips_empty_suites_and_entities_are_rejected(self):
        for content in ('<testsuite/>', '<testsuite><testcase><failure/></testcase></testsuite>',
                        '<testsuite><testcase><error/></testcase></testsuite>',
                        '<testsuite><testcase><skipped/></testcase></testsuite>',
                        '<!DOCTYPE x><testsuite><testcase/></testsuite>', 'x' * 262145):
            bundle = copy.deepcopy(self.bundle)
            bundle['reports'][0].update(content=content, sha256=hashlib.sha256(content.encode()).hexdigest())
            self.write(bundle=bundle)
            self.assertFalse(coverage.covered(self.env))
        self.bundle['reports'][0]['sha256'] = 'd' * 64
        self.write()
        self.assertFalse(coverage.covered(self.env))

    def test_absent_old_oversized_and_symlinked_action_files_fall_back(self):
        self.assertFalse(coverage.covered(self.env))
        for path in (self.policy_path, self.bundle_path):
            self.write()
            os.utime(path, (self.since - 60, self.since - 60))
            self.assertFalse(coverage.covered(self.env))
            self.write()
            path.write_text('x' * 900001)
            self.assertFalse(coverage.covered(self.env))
            self.write()
            saved = path.with_suffix('.saved')
            path.rename(saved)
            path.symlink_to(saved)
            self.assertFalse(coverage.covered(self.env))
            path.unlink()
            saved.rename(path)
        for key in self.env:
            env = dict(self.env)
            env.pop(key)
            self.assertFalse(coverage.covered(env))

    def test_malformed_or_future_action_layout_never_suppresses_tests(self):
        for path in (self.policy_path, self.bundle_path):
            for content in ('{', '[]', 'null', '{"checks": [null]}'):
                self.write()
                path.write_text(content)
                self.assertFalse(coverage.covered(self.env))
        self.write()
        self.bundle_path.rename(self.bundle_path.with_name('future-results.json'))
        self.assertFalse(coverage.covered(self.env))
        self.bundle['reports'][0]['content'] = '<testsuite><testcase>'
        self.bundle['reports'][0]['sha256'] = hashlib.sha256(self.bundle['reports'][0]['content'].encode()).hexdigest()
        self.write()
        self.assertFalse(coverage.covered(self.env))
