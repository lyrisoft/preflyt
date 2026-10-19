"""Read-only source tools with machine-observed read ranges, never model assertions."""
import json
from pathlib import Path

# Fixed program and JSON arguments: model input is never interpolated as code.
PROGRAM = r'''
import json,sys
from pathlib import Path
r=json.loads(sys.argv[1]);root=Path('/workspace/source').resolve()
try:
 if r['operation']=='read':
  name=r['path'];parts=name.split('/')
  if not name or name.startswith('/') or '\\' in name or any(p in ['', '.', '..', '.git'] for p in parts):raise ValueError()
  p=(root/name).resolve(strict=True)
  if not p.is_relative_to(root) or not p.is_file() or p.stat().st_size>2097152:raise ValueError()
  lines=p.read_text(encoding='utf-8').splitlines();start=r['start_line'];end=min(r['end_line'],len(lines))
  if start<1 or end<start or r['end_line']-start>119:raise ValueError()
  selected=lines[start-1:end];text='\n'.join(str(start+i)+': '+line for i,line in enumerate(selected))
  if len(text.encode())>16000:raise ValueError()
  result={'success':True,'path':name,'start_line':start,'end_line':end,'total_lines':len(lines),'content':text}
 else:
  query=r['query'].casefold();offset=r.get('offset',0);matches=[]
  def rank(p):
   parts=p.relative_to(root).parts
   auxiliary=any(part.startswith('.') or part in ['docs','tests','test','__tests__'] for part in parts)
   runtime=p.suffix in ['.js','.ts','.py','.go','.java','.rb','.php','.cs','.rs','.tsx','.jsx']
   return (auxiliary,not runtime,len(parts),p.relative_to(root).as_posix())
  files=sorted((p for p in root.rglob('*') if p.is_file() and not p.is_symlink()),key=rank)
  for p in files[:8000]:
   name=p.relative_to(root).as_posix()
   if r['operation']=='list':
    if query in name.casefold():matches.append(name)
   elif r['operation']=='search':
    if not query or p.stat().st_size>2097152:continue
    for number,line in enumerate(p.read_text(encoding='utf-8',errors='replace').splitlines(),1):
     if query in line.casefold():matches.append({'path':name,'line':number,'text':line[:180]})
     if len(matches)>=40:break
    if len(matches)>=40:break
  result={'success':True,'matches':matches[offset:offset+40],'total':len(matches),'truncated':len(matches)>offset+40 or (r['operation']=='search' and len(matches)>=40)}
 print(json.dumps(result))
except (ValueError,OSError,UnicodeError,KeyError,TypeError):
 print(json.dumps({'success':False,'error':'Choose an existing source path and at most 120 lines, with output below 16 KB.'}))
'''


class SourceInspection:
    def __init__(self, audit_path=None):
        self.reads = {}
        self.audit_path = audit_path

    async def execute(self, ctx, request):
        inner = ctx.context
        if request.get('operation') == 'read':
            start, end = request.get('start_line'), request.get('end_line')
            if type(start) is not int or type(end) is not int or start < 1 or end < start or end-start > 119:
                return {'success':False,'error':'Read between 1 and 120 lines at a time.'}
        elif len(request.get('query','')) > 100 or not 0 <= request.get('offset',0) <= 8000:
            return {'success':False,'error':'Use a query up to 100 characters and a valid offset.'}
        result = await inner['sandbox_session'].exec('python3','-c',PROGRAM,json.dumps(request),timeout=20)
        if not result.ok() or len(result.stdout) > 24000:
            return {'success':False,'error':'Source inspection unavailable; record a follow-up gap.'}
        value = json.loads(result.stdout)
        if request['operation'] == 'read' and value.get('success'):
            actor=inner['agent_id'];path=value['path']
            self.reads.setdefault(actor,{}).setdefault(path,[]).append((value['start_line'],value['end_line']))
            if self.audit_path:
                self.audit_path.write_text(json.dumps(self.summary()))
                self.audit_path.chmod(0o600)
        return value

    def report_issue(self, agent_id, values):
        import hashlib,re
        fields={'title':200,'reasoning':12000,'impact':4000,'remediation':8000,
                'preconditions':4000,'verification_steps':4000,'counterevidence':4000}
        for name,limit in fields.items():
            value=values.get(name)
            if not isinstance(value,str) or not value.strip() or len(value)>limit:
                return {'success':False,'error':f'Provide complete {name} within {limit} characters; do not truncate mid-sentence.'}
            if re.search(r'-----BEGIN|Bearer\s|(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]{8,}|(?:api[_ -]?key|password|secret|token)\s*[:=]',value,re.I):
                return {'success':False,'error':'Remove credential-like content from the analysis. Reference code locations instead.'}
        if values.get('severity') not in ['critical','high','medium','low']:
            return {'success':False,'error':'Use critical, high, medium or low for the advisory severity.'}
        if type(values.get('start_line')) is not int or type(values.get('end_line')) is not int or values['end_line']-values['start_line']>39:
            return {'success':False,'error':'Cite at most 40 essential source lines so the complete highlighted block fits the source viewer.'}
        loc={'file':values.get('path'),'start_line':values.get('start_line'),'end_line':values.get('end_line')}
        error=self.guard(agent_id,'create_vulnerability_report',{'code_locations':[loc]})
        if error:return {'success':False,'error':error}
        issue_id=hashlib.sha256(json.dumps([loc,values['title']],sort_keys=True).encode()).hexdigest()
        path=self.audit_path.with_name('source-issues.json')
        rows=json.loads(path.read_text()) if path.is_file() else []
        row={'title':values['title'],'severity':values['severity'],'code_locations':[loc],
             'review_status':'NEEDS_REVIEW','source_analysis':{k:values[k] for k in fields if k!='title'},'id':issue_id}
        # A shared ledger prevents the two scopes from saving the same source issue twice.
        normalize=lambda title:' '.join(title.casefold().split())
        existing=next((r for r in rows if r.get('code_locations')==[loc] and normalize(r.get('title',''))==normalize(values['title'])),None)
        if existing:
            return {'success':True,'issue_id':existing['id'],'status':'NEEDS_REVIEW','message':'This source issue is already saved. Reuse its ID in the report.'}
        rows=[r for r in rows if r['id']!=issue_id]
        if len(rows)>=50:return {'success':False,'error':'Issue limit reached. Finish the review and record remaining scope gaps.'}
        rows.append(row);temp=path.with_suffix('.tmp');temp.write_text(json.dumps(rows));temp.chmod(0o600);temp.replace(path)
        return {'success':True,'issue_id':issue_id,'status':'NEEDS_REVIEW','message':'Source-backed issue saved for Findings. No exploit execution is claimed.'}

    def summary(self):
        return {'filesRead':len({path for paths in self.reads.values() for path in paths}),
                'readOperations':sum(len(ranges) for paths in self.reads.values() for ranges in paths.values()),
                'readAgents':len(self.reads)}

    def guard(self, agent_id, tool, arguments):
        if not isinstance(arguments,dict):return 'Use a JSON object matching the tool schema.'
        paths=self.reads.get(agent_id,{})
        if tool in ['record_coverage','update_coverage'] and arguments.get('outcome') in ['reported','no_issue_found','ruled_out']:
            surface=arguments.get('surface') or ''
            if not isinstance(surface,str):return 'Use a relative source path in surface.'
            if not any(path in surface for path in paths):
                return 'Read the actual source file first. Put its relative path in surface. Otherwise record needs_follow_up.'
        if tool in ['create_vulnerability_report','update_vulnerability_report']:
            locations=arguments.get('code_locations')
            if tool=='update_vulnerability_report' and locations is None:
                return None if paths else 'Read the source before updating a finding.'
            if not isinstance(locations,list) or not locations:
                return 'Source findings require code_locations from files and lines you read with read_source_file.'
            for loc in locations:
                if not isinstance(loc,dict):return 'Invalid source location.'
                start,end=loc.get('start_line'),loc.get('end_line')
                if type(start) is not int or type(end) is not int or not any(a<=start<=end<=b for a,b in paths.get(loc.get('file'),[])):
                    return 'Read every cited source line with read_source_file before reporting it.'
        return None


def register(factory):
    from agents import RunContextWrapper, function_tool
    inspection=SourceInspection(Path.cwd()/'source-inspection.json')

    @function_tool
    async def list_source_files(ctx:RunContextWrapper, query:str='', offset:int=0)->str:
        """List uploaded source paths containing query. Paginate with offset in steps of 40."""
        return json.dumps(await inspection.execute(ctx,{'operation':'list','query':query,'offset':offset}))

    @function_tool
    async def read_source_file(ctx:RunContextWrapper, path:str, start_line:int=1, end_line:int=120)->str:
        """Read actual source with line numbers. Use a listed relative path and at most 120 lines. Required before claiming coverage or citing a finding."""
        return json.dumps(await inspection.execute(ctx,{'operation':'read','path':path,'start_line':start_line,'end_line':end_line}))

    @function_tool
    async def search_source(ctx:RunContextWrapper, query:str)->str:
        """Find up to 40 literal text matches in uploaded source. Read matching files before reporting conclusions."""
        return json.dumps(await inspection.execute(ctx,{'operation':'search','query':query}))

    @function_tool
    async def report_source_issue(ctx:RunContextWrapper, title:str, severity:str, path:str,
                                  start_line:int, end_line:int, reasoning:str, impact:str,
                                  remediation:str, preconditions:str, verification_steps:str,
                                  counterevidence:str)->str:
        """Save an unverified source-backed security concern in Preflyt Findings. Cite real lines you read. Explain data flow, missing control, impact, assumptions, protections, a concrete fix and verification steps. No executed exploit is required or claimed. Unread/unlocated concerns remain coverage gaps."""
        return json.dumps(inspection.report_issue(ctx.context['agent_id'],locals()))

    @function_tool
    async def list_source_issues(ctx:RunContextWrapper)->str:
        """List shared source issue IDs, titles and locations. Check this ledger before reporting an overlapping concern; reuse an existing ID for the same defect."""
        path=inspection.audit_path.with_name('source-issues.json')
        rows=json.loads(path.read_text()) if path.is_file() else []
        return json.dumps({'issues':[{key:row[key] for key in ['id','title','code_locations']} for row in rows]})

    @function_tool
    async def save_payment_risk_report(ctx:RunContextWrapper, report_json:str)->str:
        """Save the coordinator's complete Payment Risk Review v1 JSON. Required before finish_scan for payment-risk-v1. See trusted profile instructions for all eight report sections, domain/scenario keys and source evidence requirements."""
        import os
        from payment_risk import save_report
        if os.environ.get('PREFLYT_STRIX_REVIEW_PROFILE') not in ['payment-risk-v1','general-and-payment-risk-v1'] or ctx.context.get('parent_id') is not None:
            return json.dumps({'success':False,'error':'Only the payment review coordinator can save this report.'})
        if len(report_json.encode()) > 240000:
            return json.dumps({'success':False,'error':'Report exceeds 240 KB.'})
        try: raw=json.loads(report_json)
        except ValueError:return json.dumps({'success':False,'error':'Provide valid JSON.'})
        return json.dumps(save_report(inspection,raw))

    factory.register_agent_tools(list_source_files,read_source_file,search_source,report_source_issue,list_source_issues,save_payment_risk_report)
    return inspection
