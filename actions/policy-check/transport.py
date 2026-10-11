"""Short-lived GitHub OIDC policy fetch/result submission. Never logs tokens or bodies."""
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import urlsplit, urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

opener = build_opener(NoRedirect())

def request(url, headers, body=None):
    data = json.dumps(body).encode() if body is not None else None
    if data is not None and len(data) > 900000:
        raise ValueError('Combined results exceed the submission limit')
    req = Request(url, data=data, headers={**headers, 'Content-Type': 'application/json', 'Accept': 'application/json'})
    with opener.open(req, timeout=30) as response:
        content = response.read(900001)
        if len(content) > 900000:
            raise ValueError('Response exceeds the supported size')
        return json.loads(content)

def token():
    url = os.environ['ACTIONS_ID_TOKEN_REQUEST_URL']
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password:
        raise ValueError('GitHub identity endpoint is invalid')
    separator = '&' if parsed.query else '?'
    return request(url + separator + urlencode({'audience': 'preflyt:policy'}), {'Authorization': 'Bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})['value']

def api(path, body=None):
    base = os.environ['PREFLYT_API_URL'].rstrip('/')
    parsed = urlsplit(base)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Use the public HTTPS Preflyt API URL')
    for attempt in range(3):
        try:
            return request(base + '/pipeline/' + path, {'Authorization': 'Bearer ' + token()}, body)
        except HTTPError as error:
            if error.code not in (429, 502, 503, 504) or attempt == 2:
                raise
        except URLError:
            if attempt == 2:
                raise
        time.sleep(2 ** attempt)

def wait_for_publication(run_id, attempt, timeout=600):
    if not run_id.isdigit() or not attempt.isdigit():
        raise ValueError('Invalid source run')
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = api('publication?' + urlencode({'run': run_id, 'attempt': attempt}))
        state = result.get('state')
        if state == 'PASSED':
            return
        if state == 'FAILED':
            raise ValueError('Preflyt publication or policy gate failed')
        if state != 'PENDING':
            raise ValueError('Publication response was not confirmed')
        time.sleep(5)
    raise TimeoutError('Preflyt publication was not verified within ten minutes')

def main():
    if sys.argv[1] == 'fetch':
        policy = api('policy')
        if policy.get('schemaVersion') != 1 or policy.get('state') != 'PUBLISHED':
            raise ValueError('Published policy unavailable')
        directory = Path(tempfile.mkdtemp(prefix='preflyt-policy-', dir=os.environ['RUNNER_TEMP']))
        path = directory / 'policy.json'
        path.write_text(json.dumps(policy))
        path.chmod(0o600)
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write(f'policy={path}\n')
    elif sys.argv[1] == 'submit':
        path = Path(os.environ['PREFLYT_BUNDLE_PATH'])
        data = path.read_bytes()
        if len(data) > 900000:
            raise ValueError('Combined results exceed the submission limit')
        receipt = api('results', json.loads(data))
        if receipt.get('verification') != 'PENDING' or not receipt.get('id'):
            raise ValueError('Result submission was not confirmed')
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as output:
            output.write('\nResults received by Preflyt; completed-run verification is pending.\n')
    elif sys.argv[1] == 'gate':
        wait_for_publication(os.environ['PREFLYT_SOURCE_RUN_ID'], os.environ['PREFLYT_SOURCE_RUN_ATTEMPT'])
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as output:
            output.write('Preflyt verified the source run and published a passing GitHub check.\n')
    else:
        raise ValueError('Unsupported transport operation')

if __name__ == '__main__':
    try:
        main()
    except Exception:
        if len(sys.argv) > 1 and sys.argv[1] == 'gate':
            print('::error::Preflyt could not confirm a passing GitHub publication. Publication failed, the result is incomplete, the PR changed, or the ten-minute wait expired. Rerun the checks workflow or this gate after resolving the error.')
            raise SystemExit(1)
        print('::error::Preflyt could not fetch the policy or submit results. Check API reachability, id-token permission, published policy and enabled PR checks.')
        raise SystemExit(1)
