"""Provider compatibility for the bounded source-review tool loop."""
import json


def configure(env):
    if env.get('STRIX_LLM') != 'openai/deepseek-flash':
        return
    # DeepSeek defaults to thinking. Its reasoning can exhaust an 8K response
    # before emitting any tool call. Keep the existing cumulative token limits.
    env['STRIX_REASONING_EFFORT']='none'
    env['STRIX_DEDUPE_REASONING_EFFORT']='none'
    for key in ['LLM_EXTRA_BODY','DEDUPE_LLM_EXTRA_BODY']:
        body=json.loads(env.get(key,'{}'))
        body.pop('reasoning_effort',None)
        body['thinking']={'type':'disabled'}
        env[key]=json.dumps(body)
