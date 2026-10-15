import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest

spec = importlib.util.spec_from_file_location('export_coverage', Path(__file__).with_name('export-coverage.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ExportCoverageTests(unittest.TestCase):
    def test_exports_only_current_report_with_exact_context_and_original_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            report = root / 'lcov.info'
            data = b'SF:src/a.ts\nDA:1,1\nLF:1\nLH:1\nend_of_record\n'
            report.write_bytes(data)
            env = {'GITHUB_WORKSPACE': directory, 'CI_COVERAGE_STARTED_AT': str(time.time()-1),
                   'GITHUB_SHA': 'a'*40, 'CI_HEAD_SHA': 'b'*40, 'GITHUB_REPOSITORY_ID': '51',
                   'GITHUB_RUN_ID': '12', 'GITHUB_RUN_ATTEMPT': '2', 'GITHUB_JOB': 'source'}
            module.export('lcov.info', 'apps/api', 'out', env)
            saved = json.loads((root/'out/metadata.json').read_text())
            self.assertEqual(saved['sourceSha'], 'b'*40)
            self.assertEqual(saved['runAttempt'], 2)
            self.assertEqual(saved['sha256'], hashlib.sha256(data).hexdigest())
            self.assertEqual((root/'out/lcov.info').read_bytes(), data)
            os.utime(report,(1,1))
            with self.assertRaises(ValueError): module.export('lcov.info', 'apps/api', 'out', env)
            with self.assertRaises(ValueError): module.export('../outside', 'apps/api', 'out', env)
            with self.assertRaises(ValueError): module.export('lcov.info', 'apps/../api', 'out', env)
