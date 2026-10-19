import asyncio
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from source_inspection import SourceInspection, PROGRAM


class SourceInspectionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/'source';self.root.mkdir()
        (self.root/'auth.py').write_text('def authorize(user):\n    return user.owner\n')
        audit=Path(self.temp.name)/'inspection.json'
        self.inspection=SourceInspection(audit)
        self.calls=0
        async def execute(binary,flag,program,request,timeout):
            self.calls+=1
            program=program.replace("Path('/workspace/source')",'Path('+repr(str(self.root))+')')
            result=subprocess.run([binary,flag,program,request],capture_output=True,timeout=timeout)
            return SimpleNamespace(ok=lambda:result.returncode==0,stdout=result.stdout)
        self.ctx=SimpleNamespace(context={'agent_id':'reviewer','sandbox_session':SimpleNamespace(exec=execute)})

    async def test_batched_reads_share_sandbox_evidence_checks_and_bound_work(self):
        result=await self.inspection.read_many(self.ctx,[{'path':'auth.py','start_line':1,'end_line':1},{'path':'auth.py','start_line':2,'end_line':2}])
        self.assertTrue(result['success'])
        self.assertTrue(all(row['success'] for row in result['files']))
        self.assertEqual(self.inspection.summary()['readOperations'],2)
        before=self.calls
        for requests in [[],[{}],[{'path':'auth.py','start_line':True,'end_line':2}], [{'path':'auth.py','start_line':1,'end_line':120}]*3]:
            self.assertFalse((await self.inspection.read_many(self.ctx,requests))['success'])
        self.assertEqual(self.calls,before)
        result=await self.inspection.read_many(self.ctx,[{'path':'../outside','start_line':1,'end_line':2}])
        self.assertFalse(result['files'][0]['success'])
        self.assertEqual(self.inspection.summary()['readOperations'],2)

    def test_observed_ranges_are_deduplicated_bounded_and_never_invented_from_listing(self):
        self.assertEqual(self.inspection.observed_ranges(), {'observedSourceRanges': [], 'sourceRangesTruncated': False})
        self.inspection.reads = {'one': {'auth.py': [(1,2),(1,2)]}, 'two': {'auth.py': [(1,2),(3,4)]}}
        self.assertEqual(self.inspection.observed_ranges(1), {'observedSourceRanges':[{'path':'auth.py','startLine':1,'endLine':2}], 'sourceRangesTruncated':True})
        self.assertEqual(len(self.inspection.observed_ranges()['observedSourceRanges']), 2)

    async def test_listing_and_searching_cannot_establish_reviewed_coverage(self):
        listed=await self.inspection.execute(self.ctx,{'operation':'list','query':'auth','offset':0})
        self.assertEqual(listed['matches'],['auth.py'])
        found=await self.inspection.execute(self.ctx,{'operation':'search','query':'owner'})
        self.assertEqual(found['matches'][0]['line'],2)
        self.assertEqual(self.inspection.summary()['filesRead'],0)
        self.assertTrue(self.inspection.guard('reviewer','record_coverage',{'surface':'auth.py','outcome':'no_issue_found'}))
        self.assertIsNone(self.inspection.guard('reviewer','record_coverage',{'surface':'auth.py','outcome':'needs_follow_up'}))

    async def test_runtime_source_precedes_agent_instructions_and_documentation(self):
        hidden=self.root/'.cursor';hidden.mkdir()
        (hidden/'instructions.md').write_text('owner')
        docs=self.root/'docs';docs.mkdir();(docs/'auth.md').write_text('owner')
        listed=await self.inspection.execute(self.ctx,{'operation':'list','query':'.','offset':0})
        self.assertEqual(listed['matches'][0],'auth.py')
        found=await self.inspection.execute(self.ctx,{'operation':'search','query':'owner'})
        self.assertEqual(found['matches'][0]['path'],'auth.py')

    async def test_only_real_reads_authorize_matching_coverage_and_finding_lines(self):
        read=await self.inspection.execute(self.ctx,{'operation':'read','path':'auth.py','start_line':1,'end_line':120})
        self.assertEqual(read['end_line'],2)
        self.assertIn('2:     return user.owner',read['content'])
        self.assertIsNone(self.inspection.guard('reviewer','record_coverage',{'surface':'auth.py authorization','outcome':'no_issue_found'}))
        self.assertTrue(self.inspection.guard('other-agent','record_coverage',{'surface':'auth.py','outcome':'no_issue_found'}))
        self.assertTrue(self.inspection.guard('reviewer','record_coverage',{'surface':'whole repository','outcome':'no_issue_found'}))
        args={'code_locations':[{'file':'auth.py','start_line':1,'end_line':2}]}
        self.assertIsNone(self.inspection.guard('reviewer','create_vulnerability_report',args))
        args['code_locations'][0]['end_line']=3
        self.assertTrue(self.inspection.guard('reviewer','create_vulnerability_report',args))
        self.assertTrue(self.inspection.guard('reviewer','create_vulnerability_report',{}))
        audit=self.inspection.audit_path.read_text()
        self.assertEqual(json.loads(audit),{'filesRead':1,'readOperations':1,'readAgents':1})
        self.assertNotIn('owner',audit)

    async def test_source_issue_requires_observed_lines_and_complete_non_secret_analysis(self):
        args={'title':'Ownership is not enforced','severity':'high','path':'auth.py','start_line':1,'end_line':2,
              'reasoning':'The owner flag is read without binding the record to the authenticated caller.',
              'impact':'A caller may access another owner record.',
              'remediation':'Compare the authenticated owner identifier before reading or updating the record.',
              'preconditions':'Caller access to this route and a foreign record identifier must be verified.',
              'verification_steps':'Add a two-owner authorization regression test.',
              'counterevidence':'The caller may have an inherited guard; verify its behavior.'}
        self.assertFalse(self.inspection.report_issue('reviewer',args)['success'])
        await self.inspection.execute(self.ctx,{'operation':'read','path':'auth.py','start_line':1,'end_line':2})
        self.assertTrue(self.inspection.report_issue('reviewer',args)['success'])
        stored=json.loads(self.inspection.audit_path.with_name('source-issues.json').read_text())
        duplicate=self.inspection.report_issue('reviewer',{**args,'title':'  OWNERSHIP   IS NOT ENFORCED '})
        self.assertEqual(duplicate['issue_id'],stored[0]['id'])
        self.assertEqual(len(json.loads(self.inspection.audit_path.with_name('source-issues.json').read_text())),1)
        self.assertEqual(stored[0]['review_status'],'NEEDS_REVIEW')
        self.assertEqual(stored[0]['source_analysis']['reasoning'],args['reasoning'])
        self.assertNotIn('return user.owner',json.dumps(stored))
        for patch in [{'reasoning':''},{'remediation':'x'*8001},{'path':'../secret.py'},{'reasoning':'password: sensitive12345'}]:
            self.assertFalse(self.inspection.report_issue('reviewer',{**args,**patch})['success'])
        self.assertFalse(self.inspection.report_issue('different-agent',args)['success'])
        self.inspection.reads['payment-specialist']=self.inspection.reads['reviewer']
        duplicate=self.inspection.report_issue('payment-specialist',args)
        self.assertEqual(duplicate['issue_id'],stored[0]['id'])
        ledger=self.inspection.audit_path.with_name('source-issues.json')
        self.assertEqual(len(json.loads(ledger.read_text())),1)
        distinct=self.inspection.report_issue('payment-specialist',{**args,'title':'A different security defect at the same location'})
        self.assertNotEqual(distinct['issue_id'],stored[0]['id'])
        self.assertEqual(len(json.loads(ledger.read_text())),2)

    async def test_traversal_symlinks_and_oversized_ranges_do_not_count_as_reads(self):
        outside=Path(self.temp.name)/'private.txt';outside.write_text('PRIVATE')
        (self.root/'link').symlink_to(outside)
        for name in ['../private.txt','/etc/passwd','link','missing.py']:
            value=await self.inspection.execute(self.ctx,{'operation':'read','path':name,'start_line':1,'end_line':120})
            self.assertFalse(value['success'])
            self.assertNotIn('PRIVATE',json.dumps(value))
        count=self.calls
        value=await self.inspection.execute(self.ctx,{'operation':'read','path':'auth.py','start_line':1,'end_line':121})
        self.assertFalse(value['success']);self.assertEqual(count,self.calls)
        self.assertEqual(self.inspection.summary()['filesRead'],0)


if __name__=='__main__':unittest.main()
