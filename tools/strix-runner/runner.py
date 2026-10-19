"""Local source-review controller; Preflyt authorizes connected repository access."""
import argparse
import hashlib
import hmac
import importlib.metadata
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import ssl
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT=Path(__file__).resolve().parent
VERSION='1.7.0'
MAX_BYTES=96*1024*1024
ID=re.compile(r'^[a-f0-9]{8}-[a-f0-9-]{27}$')
LOCK=threading.Lock()
JOBS={}

def valid_repository(value):
    # This is transport validation, not repository authorization. The authenticated
    # Preflyt API checks connection, organization, permissions and model consent.
    return isinstance(value,str) and re.fullmatch(r'[1-9][0-9]{0,15}',value) is not None

def valid_sandbox_image(value):
    return isinstance(value,str) and re.fullmatch(r'[a-z0-9][a-z0-9./:_-]+(?:@sha256:[a-f0-9]{64}|:v[0-9]+\.[0-9]+\.[0-9]+|:sha-[a-f0-9]{40})',value) is not None

def reviewed_completion(exit_code,status,inspection):
    return (exit_code in [0,2] and status=='completed' and
            type(inspection.get('filesRead')) is int and inspection['filesRead']>0)

def write_json(path,value):
    temp=path.with_suffix('.tmp')
    temp.write_text(json.dumps(value))
    temp.chmod(0o600)
    temp.replace(path)

def docker_client():
    from strix.runtime.docker_connection import connect_docker
    return connect_docker()

def clean_containers(job):
    client=docker_client()
    for container in client.containers.list(all=True,filters={'label':'preflyt.strix='+job}):
        container.remove(force=True)
    return not client.containers.list(all=True,filters={'label':'preflyt.strix='+job})

def confirm_cleanup(job,result):
    if result and not result.get('cleanupConfirmed'):
        try:result['cleanupConfirmed']=clean_containers(job)
        except Exception:result['cleanupConfirmed']=False
        write_json(STATE/'receipts'/(job+'.json'),result)
    return result

def fingerprint(root):
    found={}
    for p in root.rglob('*'):
        if p.is_symlink():
            found[str(p.relative_to(root))]='symlink'
        elif p.is_file():
            found[str(p.relative_to(root))]=hashlib.sha256(p.read_bytes()).hexdigest()
    return found

def safe_text(value,limit=300):
    if not isinstance(value,str) or re.search(r'-----BEGIN|Bearer\s|(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]{8,}|(?:api[_ -]?key|password|secret|token)\s*[:=]',value,re.I):
        return ''
    return re.sub(r'[\x00-\x1f\x7f]',' ',value).strip()[:limit]

def collect_coverage(directory):
    """Agent-reported scope only. Never retain raw evidence, commands or target credentials."""
    path=directory/'coverage.json'
    if not path.is_file():return None
    if path.stat().st_size>2*1024*1024:return {'version':1,'available':False,'truncated':True}
    try:document=json.loads(path.read_text())
    except (OSError,ValueError):return {'version':1,'available':False,'truncated':True}
    if not isinstance(document,dict) or document.get('schema_version')!=1:
        return {'version':1,'available':False,'truncated':True}
    entries=document.get('entries',[]);gaps=document.get('gaps',[])
    completeness=document.get('completeness')
    if not isinstance(completeness,dict):return {'version':1,'available':False,'truncated':True}
    caveats=completeness.get('caveats',[])
    if not all(isinstance(value,list) for value in [entries,gaps,caveats]):
        return {'version':1,'available':False,'truncated':True}
    outcomes={'reported','no_issue_found','ruled_out','not_applicable','needs_follow_up'}
    projected=[]
    for entry in entries[:100]:
        if not isinstance(entry,dict) or entry.get('source')!='agent_reported' or entry.get('outcome') not in outcomes:continue
        surface=safe_text(entry.get('surface'));risk=safe_text(entry.get('risk_area'),1000)
        if surface and risk:projected.append({'surface':surface,'riskArea':risk,'outcome':entry['outcome']})
    projected_gaps=[]
    for gap in gaps[:50]:
        if not isinstance(gap,dict):continue
        detail=safe_text(gap.get('detail'),12000)
        if detail:projected_gaps.append({'surface':safe_text(gap.get('surface')),'riskArea':safe_text(gap.get('risk_area'),1000),'detail':detail})
    projected_caveats=[text for value in caveats[:10] if (text:=safe_text(value))]
    return {'version':1,'available':True,'entries':projected,'gaps':projected_gaps,'caveats':projected_caveats,
            'truncated':len(projected)!=len(entries) or len(projected_gaps)!=len(gaps) or len(projected_caveats)!=len(caveats)}

def collect(directory):
    runs=list((directory/'strix_runs').glob('*/run.json'))
    if len(runs)!=1:
        raise ValueError('STRIX_REPORT_UNAVAILABLE')
    run=json.loads(runs[0].read_text())
    result=runs[0].parent/'vulnerabilities.json'
    if not result.is_file():
        # Strix 1.7 writes the findings index only after a finding is filed.
        # Require its independently emitted empty SARIF and completed run record.
        sarif_path=runs[0].parent/'findings.sarif'
        if run.get('status')!='completed' or not sarif_path.is_file() or sarif_path.stat().st_size>8*1024*1024:
            raise ValueError('STRIX_REPORT_UNAVAILABLE')
        sarif=json.loads(sarif_path.read_text())
        sarif_runs=sarif.get('runs') if isinstance(sarif,dict) else None
        if not isinstance(sarif,dict) or sarif.get('version')!='2.1.0' or not isinstance(sarif_runs,list) or len(sarif_runs)!=1 or not isinstance(sarif_runs[0],dict):
            raise ValueError('STRIX_REPORT_INVALID')
        results=sarif_runs[0].get('results')
        # Coverage is emitted as non-failing SARIF results, independently of findings.
        if not isinstance(results,list) or any(not isinstance(item,dict) or
                not str(item.get('ruleId','')).startswith('strix-coverage/') or
                item.get('kind') not in ['pass','open','notApplicable'] or
                item.get('level')!='none' for item in results):
            raise ValueError('STRIX_REPORT_INVALID')
        findings=[]
    else:
        if result.stat().st_size>8*1024*1024:raise ValueError('STRIX_REPORT_UNAVAILABLE')
        findings=json.loads(result.read_text())
    if isinstance(findings,dict): findings=findings.get('vulnerabilities',[])
    if not isinstance(findings,list) or len(findings)>500: raise ValueError('STRIX_REPORT_INVALID')
    # Retain only the bounded adapter fields, never raw PoCs, prompts or source snippets.
    projected=[]
    for finding in findings:
        if not isinstance(finding,dict):continue
        row={k:finding.get(k) for k in ['title','severity','cwe','impact','remediation_steps']}
        row['code_locations']=[{k:loc.get(k) for k in ['file','start_line','end_line']} for loc in (finding.get('code_locations') or [])[:10] if isinstance(loc,dict)]
        for key in ['title','impact','remediation_steps']:
            row[key]=str(row.get(key) or '')[:2000]
        projected.append(row)
    issues=directory/'source-issues.json'
    if issues.is_file():
        if issues.stat().st_size>4*1024*1024:raise ValueError('STRIX_REPORT_LIMIT')
        source_issues=json.loads(issues.read_text())
        if not isinstance(source_issues,list) or len(source_issues)>50:raise ValueError('STRIX_REPORT_INVALID')
        projected.extend(source_issues)
    return run.get('status'),projected,collect_coverage(runs[0].parent)

def run_job(job,body):
    work=STATE/'jobs'/job
    source=work/'source'
    result={'version':1,'assessmentId':job,'sourceHash':body['source']['sourceHash'],'state':'FAILED','toolVersion':VERSION,'cleanupConfirmed':False,'findings':[]}
    process=None
    try:
        source.mkdir(parents=True,mode=0o700)
        import base64
        total=0
        files=body['source']['files']
        if not isinstance(files,list) or len(files)>8000:raise ValueError('SOURCE_INVALID')
        for file in files:
            path=file['path']
            parts=path.split('/')
            if not isinstance(path,str) or len(path)>512 or '\\' in path or any(p in ['', '.', '..','.git'] for p in parts) or any(ord(c)<32 for c in path):
                raise ValueError('SOURCE_PATH_INVALID')
            data=base64.b64decode(file['content'],validate=True)
            total+=len(data)
            if len(data)>2*1024*1024 or total>64*1024*1024 or hashlib.sha256(data).hexdigest()!=file['sha256']:
                raise ValueError('SOURCE_INVALID')
            p=source/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);p.chmod(0o700 if file.get('mode')=='100755' else 0o600)
        env={key:value for key,value in os.environ.items() if key in ['PATH','DOCKER_HOST','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH','DOCKER_CONTEXT']}
        (work/'home').mkdir(mode=0o700)
        env['HOME']=str(work/'home')
        env.update({'STRIX_LLM':body['model'],'LLM_API_KEY':body['modelToken'],
            'LLM_API_BASE':API_ORIGIN+'/github/strix-model/'+job+'/v1','STRIX_API_TYPE':body['apiType'],
            'LLM_EXTRA_HEADERS':json.dumps({'Authorization':'Bearer '+body['modelToken']}),
            'STRIX_RUNTIME_BACKEND':'preflyt','STRIX_TELEMETRY':'false','LLM_DISABLE_STREAMING':'true',
            'PREFLYT_STRIX_SANDBOX_IMAGE':IMAGE,'STRIX_IMAGE':IMAGE,'PREFLYT_STRIX_NETWORK':NETWORK,'PREFLYT_STRIX_ASSESSMENT':job,
            'STRIX_MAX_CONTEXT_IMAGES':'0','PREFLYT_STRIX_MAX_REQUESTS':str(body.get('maxModelCalls',80)),
            'PREFLYT_STRIX_REVIEW_PROFILE':body.get('reviewProfile','general'),
            'PREFLYT_STRIX_MAX_SPECIALISTS':str(min(body.get('maxSpecialists',2),int(os.environ.get('PREFLYT_STRIX_MAX_SPECIALISTS','2')))),
            'STRIX_TOOL_OUTPUT_MAX_TOKENS':'2000','STRIX_TOOL_OUTPUT_MAX_LINES':'150','STRIX_TOOL_OUTPUT_MAX_BYTES':'12000'})
        command=[sys.executable,str(ROOT/'scan.py'),'-n','--target',str(source),'--scope-mode','full','--scan-mode','standard',
                 '--instruction-file',str(ROOT/'review.md'),'--max-turns','40','--max-budget','5','--config',str(work/'empty-config.json')]
        write_json(work/'empty-config.json',{'env':{}})
        with (work/'engine.log').open('wb') as output:
            process=subprocess.Popen(command,cwd=work,env=env,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
            with LOCK:JOBS[job]['process']=process
            write_json(work/'scope.json',{'sourceHash':body['source']['sourceHash'],'pid':process.pid})
            deadline=time.monotonic()+1800
            while process.poll() is None:
                with LOCK:cancelled=JOBS[job].get('cancelled',False)
                oversized=(work/'engine.log').stat().st_size>16*1024*1024
                if cancelled or oversized or time.monotonic()>deadline:
                    os.killpg(process.pid,signal.SIGTERM)
                    try:process.wait(10)
                    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
                    result['state']='CANCELLED' if cancelled else 'FAILED'
                    result['reason']='EXECUTION_CANCELLED' if cancelled else 'STRIX_REPORT_LIMIT' if oversized else 'STRIX_TIMED_OUT'
                    break
                time.sleep(1)
            result['exitCode']=process.returncode
        status,findings,coverage=collect(work)
        result['findings']=findings
        if body.get('reviewProfile') in ['payment-risk-v1','general-and-payment-risk-v1']:
            report_path=work/'payment-risk-report.json'
            if not report_path.is_file() or report_path.stat().st_size > 240000:
                result['reason']='PAYMENT_RISK_REPORT_INCOMPLETE'
            else:
                result['paymentRiskReport']=json.loads(report_path.read_text())
        if coverage is not None:result['coverage']=coverage
        audit=work/'source-inspection.json'
        inspection=json.loads(audit.read_text()) if audit.is_file() else {}
        result['inspection']={key:inspection.get(key,0) for key in ['filesRead','readOperations','readAgents']}
        if result.get('reason') is None:
            result['state']='COMPLETED' if reviewed_completion(process.returncode,status,result['inspection']) else 'FAILED'
            if result['state']=='FAILED':result['reason']='STRIX_REVIEW_INCOMPLETE'
        # The sandbox gets an uploaded copy. Host-copy hashes cannot prove sandbox immutability.
        # All imported findings remain AI_REPORTED; no reproduction claim is made.
    except Exception as error:
        result['adapterError']=str(error) if isinstance(error,ValueError) and str(error).startswith('STRIX_') else type(error).__name__
        if os.environ.get('PREFLYT_STRIX_DEBUG')=='1':
            result['artifactFiles']=[str(p.relative_to(work)) for p in (work/'strix_runs').glob('*/*') if p.is_file()]
        result.setdefault('reason','STRIX_REVIEW_FAILED')
    finally:
        if process and process.poll() is None:
            os.killpg(process.pid,signal.SIGKILL);process.wait()
        try:result['cleanupConfirmed']=clean_containers(job)
        except Exception:result['cleanupConfirmed']=False
        if os.environ.get('PREFLYT_STRIX_DEBUG')=='1' and result['state']!='COMPLETED' and (work/'engine.log').is_file():
            debug=STATE/'debug';debug.mkdir(exist_ok=True,mode=0o700)
            log=(work/'engine.log').read_text(errors='replace')[-65536:].replace(body['modelToken'],'[REDACTED]')
            log=re.sub(r'(?i)(Bearer\s+)[A-Za-z0-9_.-]+',r'\1[REDACTED]',log)
            write_json(debug/(job+'.json'),{'exitCode':result.get('exitCode'),'log':log})
        shutil.rmtree(work,ignore_errors=True)
        write_json(STATE/'receipts'/(job+'.json'),result)
        with LOCK:JOBS[job]={'result':result}

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def reply(self,status,body):
        data=json.dumps(body).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def do_POST(self):
        if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+KEY):
            self.reply(403,{'error':'AUTHORIZATION_REQUIRED'});return
        try:
            length=int(self.headers.get('Content-Length','0'))
            if length<=0 or length>MAX_BYTES:raise ValueError()
            body=json.loads(self.rfile.read(length))
            if self.path=='/capabilities':
                self.reply(200,{'version':1,'toolVersion':VERSION,'available':valid_repository(body.get('repositoryId')),'mode':'local-authorized-source-copy','reviewProfiles':['general','payment-risk-v1','general-and-payment-risk-v1']});return
            job=body.get('assessmentId','')
            if not isinstance(job,str) or not ID.fullmatch(job):raise ValueError()
            if self.path=='/status':
                with LOCK:record=JOBS.get(job)
                if record is None:
                    file=STATE/'receipts'/(job+'.json')
                    record={'result':json.loads(file.read_text())} if file.is_file() else None
                if record is None:self.reply(200,{'state':'NOT_FOUND'});return
                result=confirm_cleanup(job,record.get('result'))
                if result and result.get('sourceHash')!=body.get('sourceHash'):raise ValueError()
                self.reply(200,result or {'state':'RUNNING'});return
            if self.path=='/cancel':
                with LOCK:
                    record=JOBS.get(job)
                    if record and not record.get('result'):record['cancelled']=True
                file=STATE/'receipts'/(job+'.json')
                result=(record or {}).get('result') or (json.loads(file.read_text()) if file.is_file() else None)
                result=confirm_cleanup(job,result)
                self.reply(200,result or {'state':'RUNNING','cleanupConfirmed':record is None and clean_containers(job)});return
            if self.path!='/admit' or not valid_repository(body.get('repositoryId')) or body.get('callbackOrigin')!=API_ORIGIN or not re.fullmatch('[a-f0-9]{64}',body.get('modelToken','')):
                self.reply(403,{'error':'REPOSITORY_OR_SCOPE_NOT_ALLOWED'});return
            if body.get('reviewProfile','general') not in ['general','payment-risk-v1','general-and-payment-risk-v1']:raise ValueError()
            source=body.get('source',{})
            if source.get('repositoryId')!=body['repositoryId'] or not re.fullmatch('[a-f0-9]{64}',source.get('sourceHash','')) or not re.fullmatch('[a-f0-9]{40}',source.get('sourceSha','')):raise ValueError()
            with LOCK:
                if job in JOBS:self.reply(200,{'state':'RUNNING'});return
                receipt=STATE/'receipts'/(job+'.json')
                if receipt.is_file():
                    saved=json.loads(receipt.read_text())
                    if saved.get('sourceHash')!=source['sourceHash']:raise ValueError()
                    self.reply(200,{'state':saved['state']});return
                if any(not value.get('result') or not value['result'].get('cleanupConfirmed') for value in JOBS.values()):self.reply(409,{'error':'RUNNER_BUSY'});return
                JOBS[job]={}
                (STATE/'jobs'/job).mkdir(mode=0o700)
                write_json(STATE/'jobs'/job/'scope.json',{'sourceHash':source['sourceHash']})
            thread=threading.Thread(target=run_job,args=(job,body),daemon=True)
            with LOCK:JOBS[job]['thread']=thread
            thread.start()
            self.reply(200,{'state':'RUNNING'})
        except Exception:self.reply(400,{'error':'REQUEST_INVALID'})

def main():
    global STATE,KEY,IMAGE,NETWORK,API_ORIGIN
    parser=argparse.ArgumentParser()
    parser.add_argument('--state',default='apps/api/.preflyt/strix')
    parser.add_argument('--port',type=int,default=3012)
    parser.add_argument('--host',default='127.0.0.1')
    parser.add_argument('--origin',default=None)
    parser.add_argument('--connection-file',default=None)
    args=parser.parse_args()
    os.umask(0o077)
    if importlib.metadata.version('strix-agent')!=VERSION:raise SystemExit('Install the pinned Strix runner environment first.')
    API_ORIGIN=os.environ.get('PREFLYT_API_ORIGIN','http://127.0.0.1:3000').rstrip('/')
    STATE=Path(args.state).resolve();STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
    for name in ['jobs','receipts']:(STATE/name).mkdir(exist_ok=True,mode=0o700)
    for receipt in (STATE/'receipts').glob('*.json'):
        if receipt.stat().st_mtime<time.time()-7*86400:receipt.unlink()
    KEY=(STATE/'key').read_text() if (STATE/'key').is_file() else secrets.token_hex(32)
    (STATE/'key').write_text(KEY);(STATE/'key').chmod(0o600)
    cert=STATE/'cert.pem';key=STATE/'tls-key.pem'
    if not cert.is_file() or subprocess.run(['openssl','x509','-checkend','604800','-noout','-in',str(cert)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode != 0:
        subprocess.run(['openssl','req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-keyout',str(key),'-out',str(cert),'-days','365','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1,DNS:strix-runner'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if not os.environ.get('DOCKER_HOST'):
        os.environ['DOCKER_HOST']=subprocess.check_output(['docker','context','inspect','--format','{{.Endpoints.docker.Host}}'],text=True).strip()
    client=docker_client()
    # Production pulls a versioned release image into its dedicated engine.
    # Local development retains the reviewed wrapper build from an immutable base.
    prebuilt=os.environ.get('PREFLYT_STRIX_SANDBOX_IMAGE')
    if prebuilt:
        if not valid_sandbox_image(prebuilt):
            raise SystemExit('Use an immutable digest or versioned release sandbox image.')
        try:prepared=client.images.get(prebuilt)
        except __import__('docker').errors.ImageNotFound:prepared=client.images.pull(prebuilt)
        IMAGE=prepared.id
    else:
        base=os.environ.get('STRIX_SANDBOX_BASE','')
        if '@sha256:' not in base:raise SystemExit('Set STRIX_SANDBOX_BASE to the reviewed upstream sandbox image digest.')
        built=subprocess.check_output(['docker','build','--pull=false','--quiet','--file',str(ROOT/'sandbox.Dockerfile'),'--build-arg','STRIX_SANDBOX_BASE='+base,'--tag','preflyt-strix-sandbox:local',str(ROOT)],text=True,timeout=180)
        IMAGE=client.images.get(built.strip().splitlines()[-1]).id
    NETWORK='preflyt-strix-isolated'
    try:network=client.networks.get(NETWORK)
    except Exception:network=client.networks.create(NETWORK,driver='bridge',internal=True)
    if not network.attrs.get('Internal'):raise SystemExit('Strix network must be internal.')
    for receipt in (STATE/'receipts').glob('*.json'):
        if ID.fullmatch(receipt.stem):
            result=json.loads(receipt.read_text())
            if not result.get('cleanupConfirmed'):
                JOBS[receipt.stem]={'result':confirm_cleanup(receipt.stem,result)}
    # Interrupted jobs are never resumed with old paid model calls.
    for directory in (STATE/'jobs').iterdir():
        if directory.is_dir() and ID.fullmatch(directory.name):
            scope=json.loads((directory/'scope.json').read_text())
            pid=scope.get('pid')
            if isinstance(pid,int) and pid>1:
                try:
                    command=subprocess.check_output(['ps','-p',str(pid),'-o','command='],text=True)
                    if str(ROOT/'scan.py') in command and str(directory/'source') in command and os.getpgid(pid)==pid:
                        os.killpg(pid,signal.SIGKILL)
                except (ProcessLookupError,subprocess.CalledProcessError):pass
            cleaned=clean_containers(directory.name)
            result={'version':1,'assessmentId':directory.name,'sourceHash':scope['sourceHash'],'state':'FAILED','toolVersion':VERSION,'reason':'STRIX_RUNNER_RESTARTED','cleanupConfirmed':cleaned,'findings':[]}
            write_json(STATE/'receipts'/(directory.name+'.json'),result)
            JOBS[directory.name]={'result':result}
            shutil.rmtree(directory)
    context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(cert,key)
    if args.host not in ['127.0.0.1','0.0.0.0']:raise SystemExit('Invalid controller listen address.')
    origin=args.origin or f'https://127.0.0.1:{args.port}'
    if origin not in [f'https://127.0.0.1:{args.port}',f'https://strix-runner:{args.port}']:raise SystemExit('Invalid controller origin.')
    server=ThreadingHTTPServer((args.host,args.port),Handler);server.socket=context.wrap_socket(server.socket,server_side=True)
    connection=Path(args.connection_file) if args.connection_file else STATE/'connection.json'
    write_json(connection,{'origin':origin,'apiKey':KEY,'ca':cert.read_text()})
    print('Strix runner ready for connected repositories authorized by Preflyt.',flush=True)
    def shutdown(signum,frame):
        with LOCK:
            processes=[value.get('process') for value in JOBS.values()]
            threads=[value.get('thread') for value in JOBS.values()]
            for value in JOBS.values():value['cancelled']=True
        for process in processes:
            if process and process.poll() is None:
                try:os.killpg(process.pid,signal.SIGTERM)
                except ProcessLookupError:pass
        for thread in threads:
            if thread:thread.join(timeout=5)
        for process in processes:
            if process and process.poll() is None:
                try:os.killpg(process.pid,signal.SIGKILL)
                except ProcessLookupError:pass
        raise SystemExit(0)
    signal.signal(signal.SIGTERM,shutdown)
    signal.signal(signal.SIGINT,shutdown)
    server.serve_forever()

if __name__=='__main__':main()
