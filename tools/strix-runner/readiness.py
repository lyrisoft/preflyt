"""Authenticated TLS readiness, including engine and sandbox preparation; no paid model calls."""
import json
from pathlib import Path
import ssl
import urllib.request


def ready(connection_file='/run/preflyt-strix/connection.json'):
    connection=json.loads(Path(connection_file).read_text())
    context=ssl.create_default_context(cadata=connection['ca'])
    request=urllib.request.Request(connection['origin']+'/capabilities',data=b'{"repositoryId":"1"}',headers={'Content-Type':'application/json','Authorization':'Bearer '+connection['apiKey']})
    with urllib.request.urlopen(request,context=context,timeout=5) as response:
        body=json.load(response)
    from runner import docker_client
    client=docker_client()
    if not client.ping() or not client.networks.get('preflyt-strix-isolated').attrs.get('Internal'):raise ValueError('Runner engine unavailable')
    if body.get('toolVersion')!='1.7.0' or not all(profile in body.get('reviewProfiles',[]) for profile in ['general','payment-risk-v1','general-and-payment-risk-v1']):raise ValueError('Runner profile support unavailable')

if __name__=='__main__':ready()
