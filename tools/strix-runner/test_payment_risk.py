import copy
import json
from pathlib import Path
import tempfile
import unittest
from payment_risk import DOMAINS, SCENARIOS, AREAS, TIMEFRAMES, validate_report, save_report
from source_inspection import SourceInspection


def fixture():
    reference={'path':'payments.py','startLine':1,'endLine':2}
    outcome={'outcome':'reviewed','reason':'Inspected ownership validation in the payment handler.','issueIds':['issue-1'],'references':[reference]}
    return {'version':1,'profile':'payment-risk-v1','executiveSummary':'A payment ownership concern needs independent review.',
      'systemInventory':[{'service':'Payments API','description':'Accepts payout requests and calls the provider.','references':[reference]}],
      'findings':[{'issueId':'issue-1','category':'payment_security','service':'Payments API','function':'pay','classification':'LIKELY','likelihood':4,'impact':5,'attackScenario':'A caller may supply another merchant identifier.'}],
      'domains':[dict(copy.deepcopy(outcome),domain=key) for key in DOMAINS],
      'paymentRiskRegister':[dict(copy.deepcopy(outcome),area=key) for key in AREAS],
      'attackScenarios':[dict(copy.deepcopy(outcome),scenario=key) for key in SCENARIOS],
      'remediationPlan':[{'timeframe':key,'actions':'Add ownership validation and an authorization regression test.','issueIds':['issue-1']} for key in TIMEFRAMES],
      'qaRegressionCases':[{'issueId':'issue-1','test':'Create two merchants; request a payout as the other owner and assert denial and unchanged balances.'}],
      'finalRiskSummary':{'summary':'Ownership needs review.','topIssueIds':['issue-1'],'immediateActions':'Verify the handler before applying the proposed fix.'}}

class PaymentRiskTests(unittest.TestCase):
    def test_contract_scores_from_inputs_and_preserves_explicit_gaps(self):
        raw=fixture();raw['findings'][0]['score']=1
        raw['attackScenarios'][0].update(outcome='needs_follow_up',references=[],reason='Provider behavior is unavailable in this snapshot.')
        parsed=validate_report(raw,[{'id':'issue-1'}],lambda ref:True)
        self.assertEqual(parsed['findings'][0]['score'],20)
        self.assertEqual(parsed['findings'][0]['severity'],'critical')
        self.assertEqual(parsed['attackScenarios'][0]['outcome'],'needs_follow_up')

    def test_rejects_missing_sections_scenarios_invented_ids_and_claimed_confirmation(self):
        variants=[]
        for key in ['domains','paymentRiskRegister','attackScenarios','remediationPlan','qaRegressionCases']:
            raw=fixture();raw[key].pop();variants.append(raw)
        for key,value in [('classification','CONFIRMED'),('likelihood',True),('impact',6),('issueId','invented'),('attackScenario','password: secret-value')]:
            raw=fixture();raw['findings'][0][key]=value;variants.append(raw)
        raw=fixture();raw['attackScenarios'][0]['references']=[];variants.append(raw)
        for raw in variants:
            with self.assertRaises(ValueError):validate_report(raw,[{'id':'issue-1'}],lambda ref:True)
        with self.assertRaises(ValueError):validate_report(fixture(),[{'id':'issue-1'}],lambda ref:False)

    def test_coordinator_can_reference_specialist_reads_but_never_unread_source(self):
        with tempfile.TemporaryDirectory() as directory:
            inspection=SourceInspection(Path(directory)/'source-inspection.json')
            inspection.audit_path.with_name('source-issues.json').write_text(json.dumps([{'id':'issue-1'}]))
            self.assertFalse(save_report(inspection,fixture())['success'])
            inspection.reads={'specialist':{'payments.py':[(1,2)]}}
            self.assertTrue(save_report(inspection,fixture())['success'])
            saved=inspection.audit_path.with_name('payment-risk-report.json')
            self.assertEqual(saved.stat().st_mode & 0o777,0o600)
            raw=fixture();raw['systemInventory'][0]['references'][0]['path']='unread.py'
            self.assertFalse(save_report(inspection,raw)['success'])
            inspection.audit_path.with_name('source-issues.json').write_text(json.dumps([{'id':'issue-1'},{'id':'late-issue'}]))
            self.assertFalse(save_report(inspection,json.loads(saved.read_text()))['success'])

    def test_finish_scan_requires_a_current_report_and_keeps_general_reviews_unchanged(self):
        import asyncio
        import os
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, patch
        from bounded_scan import install
        async def run():
            with tempfile.TemporaryDirectory() as directory:
                inspection=SourceInspection(Path(directory)/'source-inspection.json')
                inspection.reads={'specialist':{'payments.py':[(1,2)]}}
                inspection.audit_path.with_name('source-issues.json').write_text(json.dumps([{'id':'issue-1'}]))
                finished=AsyncMock(return_value='finished')
                def build(**kwargs):
                    return SimpleNamespace(tools=[SimpleNamespace(name='finish_scan',on_invoke_tool=finished)],capabilities=[])
                factory=SimpleNamespace(build_strix_agent=build)
                engine=SimpleNamespace(start_child_agent=AsyncMock(),run_strix_scan=AsyncMock())
                with patch.dict(os.environ,{'PREFLYT_STRIX_REVIEW_PROFILE':'general-and-payment-risk-v1'}):
                    install(engine,factory,inspection)
                    agent=factory.build_strix_agent(is_root=True)
                ctx=SimpleNamespace(context={'agent_id':'coordinator'})
                tool=agent.tools[0]
                self.assertFalse(json.loads(await tool.on_invoke_tool(ctx,'{}'))['success'])
                finished.assert_not_called()
                self.assertTrue(save_report(inspection,fixture())['success'])
                self.assertEqual(await tool.on_invoke_tool(ctx,'{}'),'finished')
                inspection.audit_path.with_name('source-issues.json').write_text(json.dumps([{'id':'issue-1'},{'id':'late-issue'}]))
                self.assertFalse(json.loads(await tool.on_invoke_tool(ctx,'{}'))['success'])
                self.assertEqual(finished.await_count,1)
        asyncio.run(run())
