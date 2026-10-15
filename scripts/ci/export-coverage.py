"""Export the LCOV bytes from this test execution, never run tests again."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys

MAX_RAW = 8 * 1024 * 1024


def export(report, prefix, destination, env=os.environ):
    root = Path(env['GITHUB_WORKSPACE']).resolve()
    source = (root / report).resolve()
    target = (root / destination).resolve()
    since = float(env['CI_COVERAGE_STARTED_AT'])
    head = env.get('CI_HEAD_SHA') or env['GITHUB_SHA']
    if (not re.fullmatch('[a-f0-9]{40}', head) or
            not re.fullmatch(r'[\w.-]+(?:/[\w.-]+)*', prefix) or '..' in prefix.split('/')):
        raise ValueError('Invalid coverage context')
    if not source.is_relative_to(root) or not target.is_relative_to(root) or source.is_symlink():
        raise ValueError('Coverage path escapes checkout')
    stat = source.stat()
    if stat.st_mtime < since or not 0 < stat.st_size <= MAX_RAW:
        raise ValueError('Missing, stale or oversized coverage')
    raw = source.read_bytes()
    if not raw.startswith((b'TN:', b'SF:')) or b'end_of_record' not in raw:
        raise ValueError('Missing LCOV execution output')
    metadata = {'version': 1, 'repositoryId': env['GITHUB_REPOSITORY_ID'], 'sourceSha': head,
                'runId': env['GITHUB_RUN_ID'], 'runAttempt': int(env['GITHUB_RUN_ATTEMPT']),
                'jobName': env['GITHUB_JOB'], 'prefix': prefix, 'sha256': hashlib.sha256(raw).hexdigest()}
    target.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target / 'lcov.info')
    (target / 'metadata.json').write_text(json.dumps(metadata, separators=(',', ':')))


if __name__ == '__main__':
    try:
        export(*sys.argv[1:])
    except (OSError, ValueError, KeyError, TypeError):
        print('Coverage export failed: current test output and workflow context are required.', file=sys.stderr)
        sys.exit(1)
