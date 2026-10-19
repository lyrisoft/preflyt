import json
import unittest
from model_profile import configure


class ModelProfileTests(unittest.TestCase):
    def test_deepseek_tool_loop_disables_thinking_without_conflicting_effort(self):
        env={'STRIX_LLM':'openai/deepseek-flash','LLM_EXTRA_BODY':'{"reasoning_effort":"high","temperature":0.5}'}
        configure(env)
        self.assertEqual(env['STRIX_REASONING_EFFORT'],'none')
        self.assertEqual(json.loads(env['LLM_EXTRA_BODY']),{'temperature':0.5,'thinking':{'type':'disabled'}})
        self.assertEqual(json.loads(env['DEDUPE_LLM_EXTRA_BODY']),{'thinking':{'type':'disabled'}})

    def test_other_models_keep_their_existing_profile(self):
        env={'STRIX_LLM':'openai/other-model','STRIX_REASONING_EFFORT':'high'}
        before=dict(env);configure(env);self.assertEqual(env,before)
