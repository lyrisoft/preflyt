import asyncio
import os
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
from bounded_scan import install, plan, source_tools, source_prompt


class BudgetTests(unittest.IsolatedAsyncioTestCase):
    def test_coordinator_cannot_file_findings_and_specialist_cannot_delegate(self):
        names=['create_agent','create_vulnerability_report','finish_scan','agent_finish','record_coverage','think','create_todo']
        agent=lambda:SimpleNamespace(tools=[SimpleNamespace(name=n,description=n) for n in names])
        self.assertNotIn('create_vulnerability_report',[t.name for t in source_tools(agent(),True).tools])
        self.assertNotIn('create_agent',[t.name for t in source_tools(agent(),False).tools])
        self.assertIn('agent_finish',[t.name for t in source_tools(agent(),False).tools])
        self.assertNotIn('think',[t.name for t in source_tools(agent(),False).tools])
        self.assertNotIn('create_todo',[t.name for t in source_tools(agent(),False).tools])
        root=source_prompt(True,'TRUSTED_REVIEW','BOUNDED_PLAN','VERIFIED_SCOPE_BLOCK')
        child=source_prompt(False,'TRUSTED_REVIEW','BOUNDED_PLAN','VERIFIED_SCOPE_BLOCK')
        self.assertTrue(root.endswith('VERIFIED_SCOPE_BLOCK'))
        self.assertTrue(child.endswith('VERIFIED_SCOPE_BLOCK'))
        self.assertIn('Do not investigate or file vulnerabilities yourself',root)
        self.assertIn('Set skills to [] and inherit_context to false',root)
        self.assertIn('first action must inspect the actual source',child)
        self.assertIn('needs_follow_up',child)
        self.assertIn('TRUSTED_REVIEW',child)

    def test_source_tools_keep_schemas_handlers_and_sandbox_but_omit_network_tools(self):
        handler=object()
        schema={'required':['evidence'],'properties':{'evidence':{'type':'string'}}}
        tool=SimpleNamespace(name='create_vulnerability_report',description='x'*4000,params_json_schema=schema,on_invoke_tool=handler)
        finish=SimpleNamespace(name='finish_scan',description='finish')
        capabilities=object()
        agent=SimpleNamespace(tools=[tool,finish,SimpleNamespace(name='web_search')],capabilities=capabilities)
        self.assertIs(source_tools(agent),agent)
        self.assertEqual([t.name for t in agent.tools],['create_vulnerability_report','finish_scan'])
        self.assertEqual(len(agent.tools[0].description),900)
        self.assertEqual(len(tool.description),4000)
        self.assertIs(agent.tools[0].params_json_schema,schema)
        self.assertIs(agent.tools[0].on_invoke_tool,handler)
        self.assertIs(agent.capabilities,capabilities)

    async def test_limits_concurrent_fanout_and_nested_children_without_losing_scope(self):
        child = AsyncMock(return_value={'success':True})
        run = AsyncMock(return_value='finished')
        engine = SimpleNamespace(start_child_agent=child, run_strix_scan=run)
        with patch.dict(os.environ, {'PREFLYT_STRIX_MAX_REQUESTS':'80'}):
            install(engine)
        request = dict(parent_ctx={'agent_id':'root','parent_id':None},task='Review source auth',parent_history=['large shared history'])
        results = await asyncio.gather(*(engine.start_child_agent(**request) for _ in range(4)))
        self.assertEqual(sum(r['success'] for r in results),2)
        self.assertEqual(child.await_count,2)
        self.assertEqual(child.call_args.kwargs['parent_history'],[])
        self.assertIn('Review source auth',child.call_args.kwargs['task'])
        self.assertIn('needs_follow_up',child.call_args.kwargs['task'])
        self.assertFalse((await engine.start_child_agent(**{**request,'parent_ctx':{'parent_id':'root'}}))['success'])
        self.assertEqual(await engine.run_strix_scan(max_turns=40,scan_config={'source':'same'},image='pinned'), 'finished')
        self.assertEqual(run.call_args.kwargs['max_turns'],16)
        self.assertEqual(run.call_args.kwargs['scan_config'],{'source':'same'})
        self.assertIn('finish_scan',run.call_args.kwargs['root_instructions_override'])

    async def test_engine_failure_is_not_converted_to_success(self):
        engine=SimpleNamespace(start_child_agent=AsyncMock(),run_strix_scan=AsyncMock(side_effect=RuntimeError('failed')))
        install(engine)
        with self.assertRaises(RuntimeError):await engine.run_strix_scan()

    def test_request_plans_leave_reporting_reserve_and_reject_invalid_limits(self):
        for limit in [12,20,48,80,1000]:
            children,turns=plan(limit)
            self.assertLess((children+1)*turns,limit)
        for value in [0,True,'80',1001]:
            with self.assertRaises(ValueError):plan(value)
