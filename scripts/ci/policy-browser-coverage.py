"""Avoid a duplicate focused run only after this run's full browser suite passes.

This is a local scheduling optimization for preflyt-action v2.1.1, not policy
evidence or a replacement for Preflyt's independent final gate. Unknown action
layouts, commands, reports and policy revisions fall back to focused tests.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET


# This exact reviewed command runs ALL browser tests (no file/filter/changed flags).
# Any future narrowed/custom command must not silently replace focused coverage.
FULL_BROWSER_COMMAND = (
    'mkdir -p "$GITHUB_WORKSPACE/.preflyt/results" && '
    'pnpm --filter @preflyt/web exec playwright install --with-deps chromium && '
    'pnpm --filter @preflyt/web exec vitest run --browser.headless --reporter=junit '
    '--outputFile="$GITHUB_WORKSPACE/.preflyt/results/frontend.components.xml"'
)


def current_json(path, since):
    if path.is_symlink() or path.parent.is_symlink():
        raise ValueError('Unsupported result path')
    stat = path.stat()
    if stat.st_mtime < since or stat.st_size > 900000:
        raise ValueError('Old or oversized result')
    return json.loads(path.read_bytes())


def successful_suite(report):
    content = report.get('content', '')
    if not isinstance(content, str):
        return False
    raw = content.encode()
    if len(raw) > 262144 or b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        return False
    if hashlib.sha256(raw).hexdigest() != report.get('sha256'):
        return False
    root = ET.fromstring(raw)
    cases = list(root.iter('testcase'))
    return (root.tag in ('testsuite', 'testsuites') and 0 < len(cases) <= 5000
            and not list(root.iter('failure')) and not list(root.iter('error'))
            and any(case.find('skipped') is None for case in cases))


def _covered(env):
    """Never reuse a prior commit, run attempt, job or differently scoped command."""
    required = ('RUNNER_TEMP', 'CI_POLICY_STARTED_AT', 'CI_HEAD_SHA', 'GITHUB_SHA',
                'GITHUB_REPOSITORY_ID', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT',
                'GITHUB_JOB', 'GITHUB_WORKFLOW_REF')
    if any(not env.get(key) for key in required):
        return False
    if not all(re.fullmatch('[a-f0-9]{40}', env[key]) for key in ('CI_HEAD_SHA', 'GITHUB_SHA')):
        return False
    since = float(env['CI_POLICY_STARTED_AT'])
    paths = sorted(Path(env['RUNNER_TEMP']).glob('preflyt-*'))
    if len(paths) > 64:
        return False
    policies, bundles = [], []
    for directory in paths:
        for filename, target in [('policy.json', policies), ('preflyt-results.json', bundles)]:
            try:
                target.append(current_json(directory / filename, since))
            except (OSError, ValueError):
                continue
    for policy in policies:
        if (policy.get('schemaVersion') != 1 or policy.get('executionVersion') != 1
                or policy.get('state') != 'PUBLISHED'
                or policy.get('headSha') != env['CI_HEAD_SHA']
                or policy.get('sourceSha') != env['GITHUB_SHA']
                or str(policy.get('repositoryId')) != env['GITHUB_REPOSITORY_ID']
                or not policy.get('id') or not re.fullmatch('[a-f0-9]{64}', policy.get('definitionHash', ''))):
            continue
        checks = [c for c in policy.get('checks', []) if c.get('id') == 'frontend.components']
        if len(checks) != 1 or checks[0].get('execution', {}).get('argv') != ['bash', '-lc', FULL_BROWSER_COMMAND]:
            continue
        for bundle in bundles:
            if (bundle.get('schemaVersion') != 1 or bundle.get('verificationScope') != 'jobs'
                    or bundle.get('policyId') != policy['id'] or bundle.get('policyHash') != policy['definitionHash']
                    or bundle.get('headSha') != env['CI_HEAD_SHA'] or bundle.get('sourceSha') != env['GITHUB_SHA']
                    or str(bundle.get('repositoryId')) != env['GITHUB_REPOSITORY_ID']
                    or str(bundle.get('runId')) != env['GITHUB_RUN_ID']
                    or str(bundle.get('runAttempt')) != env['GITHUB_RUN_ATTEMPT']
                    or bundle.get('jobName') != env['GITHUB_JOB']
                    or bundle.get('signerWorkflow') != env['GITHUB_WORKFLOW_REF'].split('@')[0]):
                continue
            outcomes = [r for r in bundle.get('results', []) if r.get('ruleId') == 'frontend.components']
            reports = [r for r in bundle.get('reports', []) if r.get('ruleId') == 'frontend.components']
            if (len(outcomes) == len(reports) == 1 and outcomes[0].get('status') == 'passed'
                    and reports[0].get('format') == 'junit' and successful_suite(reports[0])):
                return True
    return False


def covered(env):
    try:
        return _covered(env)
    except (OSError, ValueError, TypeError, KeyError, AttributeError, ET.ParseError):
        return False


if __name__ == '__main__':
    # A checkout mismatch is a workflow error, not permission to skip any test.
    checkout = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    if checkout != os.environ.get('CI_HEAD_SHA'):
        raise SystemExit('Browser coverage checkout differs from the PR head')
    result = covered(os.environ)
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        output.write(f'covered={str(result).lower()}\n')
    print('Full browser suite already passed in this policy run; related tests are covered.' if result else
          'No matching completed full browser suite; run related browser tests.')
