import importlib.util
import json
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock

spec=importlib.util.spec_from_file_location('preflyt_runner',Path(__file__).with_name('runner.py'))
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)

class ContractTests(unittest.TestCase):
    def test_release_sandbox_images_require_immutable_or_versioned_references(self):
        for ref in ['ghcr.io/lyrisoft/preflyt-strix-sandbox:v0.1.11','ghcr.io/lyrisoft/preflyt-strix-sandbox:sha-'+'a'*40,'registry.test:5000/review/sandbox@sha256:'+'b'*64]:
            self.assertTrue(runner.valid_sandbox_image(ref))
        for ref in [None,'sandbox','sandbox:latest','sandbox:development','sandbox:v1','sandbox:sha-abcd']:
            self.assertFalse(runner.valid_sandbox_image(ref))

    def test_model_completion_without_observed_source_reads_is_not_success(self):
        for inspection in [{},{'filesRead':0},{'filesRead':True}]:
            self.assertFalse(runner.reviewed_completion(0,'completed',inspection))
        self.assertFalse(runner.reviewed_completion(1,'completed',{'filesRead':2}))
        self.assertFalse(runner.reviewed_completion(0,'failed',{'filesRead':2}))
        self.assertTrue(runner.reviewed_completion(2,'completed',{'filesRead':2}))
    def request(self,path,body,authorized=True):
        data=json.dumps(body).encode()
        handler=runner.Handler.__new__(runner.Handler)
        handler.path=path
        handler.headers={'Content-Length':str(len(data)), 'Authorization':'Bearer trusted-controller-key' if authorized else 'Bearer invalid'}
        handler.rfile=io.BytesIO(data)
        handler.reply=Mock()
        with patch.object(runner,'KEY','trusted-controller-key',create=True), patch.object(runner,'API_ORIGIN','http://127.0.0.1:3001',create=True):
            handler.do_POST()
        return handler.reply.call_args.args

    def test_capabilities_accept_other_repositories_but_still_require_authentication(self):
        status,body=self.request('/capabilities',{'repositoryId':'1411149123'})
        self.assertEqual(status,200)
        self.assertTrue(body['available'])
        self.assertEqual(self.request('/capabilities',{'repositoryId':'1411149123'},False)[0],403)
        self.assertFalse(self.request('/capabilities',{'repositoryId':'../source'})[1]['available'])

    def test_admission_retains_callback_and_source_repository_binding(self):
        body={'assessmentId':'11111111-1111-4111-8111-111111111111','repositoryId':'1411149123',
              'modelToken':'a'*64,'callbackOrigin':'http://127.0.0.1:3001',
              'source':{'repositoryId':'1097527174','sourceHash':'b'*64,'sourceSha':'c'*40}}
        self.assertEqual(self.request('/admit',body)[0],400)
        body['callbackOrigin']='https://outside.invalid'
        self.assertEqual(self.request('/admit',body)[0],403)

    def test_repository_transport_accepts_all_ids_without_a_test_allowlist(self):
        for value in ['1097527174','1411149123','99']:
            self.assertTrue(runner.valid_repository(value))
        for value in [None,99,'','0','../source','https://github.com/owner/repo','9'*17]:
            self.assertFalse(runner.valid_repository(value))
    def test_collection_removes_raw_proofs_and_source_fixes(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);run=root/'strix_runs'/'test';run.mkdir(parents=True)
            (run/'run.json').write_text(json.dumps({'status':'completed'}))
            (run/'vulnerabilities.json').write_text(json.dumps([{'title':'Auth flaw','severity':'high','poc_script_code':'DO_NOT_RETAIN','code_locations':[{'file':'app.py','start_line':1,'fix_before':'PRIVATE_SOURCE'}]}]))
            status,findings,coverage=runner.collect(root)
            self.assertEqual(status,'completed')
            self.assertIsNone(coverage)
            self.assertNotIn('DO_NOT_RETAIN',json.dumps(findings))
            self.assertNotIn('PRIVATE_SOURCE',json.dumps(findings))
    def test_collection_retains_complete_unverified_source_issue_analysis(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);run=root/'strix_runs'/'test';run.mkdir(parents=True)
            (run/'run.json').write_text(json.dumps({'status':'completed'}))
            (run/'findings.sarif').write_text(json.dumps({'version':'2.1.0','runs':[{'results':[]}]}))
            issue={'title':'Unscoped lookup','review_status':'NEEDS_REVIEW','source_analysis':{'reasoning':'Full source reasoning. '*300},'code_locations':[{'file':'auth.py','start_line':1,'end_line':2}]}
            (root/'source-issues.json').write_text(json.dumps([issue]))
            status,findings,coverage=runner.collect(root)
            self.assertEqual(status,'completed')
            self.assertEqual(findings,[issue])

    def test_missing_reports_are_not_clean(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):runner.collect(Path(directory))
    def test_completed_zero_findings_requires_empty_sarif(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);run=root/'strix_runs'/'test';run.mkdir(parents=True)
            record=run/'run.json';record.write_text(json.dumps({'status':'completed'}))
            with self.assertRaises(ValueError):runner.collect(root)
            sarif=run/'findings.sarif'
            sarif.write_text(json.dumps({'version':'2.1.0','runs':[{'results':[]}]}))
            self.assertEqual(runner.collect(root)[:2],('completed',[]))
            sarif.write_text(json.dumps({'version':'2.1.0','runs':[{'results':[{'ruleId':'strix-coverage/auth','kind':'open','level':'none'}]}]}))
            self.assertEqual(runner.collect(root)[:2],('completed',[]))
            record.write_text(json.dumps({'status':'failed'}))
            with self.assertRaises(ValueError):runner.collect(root)
            record.write_text(json.dumps({'status':'completed'}))
            sarif.write_text(json.dumps({'version':'2.1.0','runs':[{'results':[{'message':{'text':'finding'}}]}]}))
            with self.assertRaises(ValueError):runner.collect(root)
    def test_source_changes_and_symlinks_are_visible(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'app.py').write_text('original')
            first=runner.fingerprint(root)
            (root/'app.py').write_text('changed')
            self.assertNotEqual(first,runner.fingerprint(root))
            (root/'link').symlink_to('/tmp')
            self.assertEqual(runner.fingerprint(root)['link'],'symlink')

    def test_coverage_retains_bounded_scope_without_raw_execution_claims(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/'coverage.json').write_text(json.dumps({'schema_version':1,'entries':[
                {'surface':'src/routes.py','risk_area':'Authorization','outcome':'needs_follow_up','source':'agent_reported','evidence':'DO_NOT_RETAIN'},
                {'surface':'token = private-value','risk_area':'Auth','outcome':'reported','source':'agent_reported'},
            ],'gaps':[{'surface':'Payments','risk_area':'Race conditions','detail':'No local service available','raw_log':'PRIVATE_LOG'}],
                'completeness':{'complete':True,'caveats':[]}}))
            coverage=runner.collect_coverage(root)
            self.assertEqual(len(coverage['entries']),1)
            self.assertTrue(coverage['truncated'])
            self.assertNotIn('DO_NOT_RETAIN',json.dumps(coverage))
            self.assertNotIn('PRIVATE_LOG',json.dumps(coverage))
            self.assertNotIn('private-value',json.dumps(coverage))
            self.assertNotIn('complete',coverage)

    def test_invalid_and_oversized_coverage_is_unavailable(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);path=root/'coverage.json'
            path.write_text('{broken')
            self.assertFalse(runner.collect_coverage(root)['available'])
            path.write_bytes(b'x'*(2*1024*1024+1))
            self.assertFalse(runner.collect_coverage(root)['available'])

if __name__=='__main__':unittest.main()
