import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { applicableHealthAnalyses, healthReport, comparableHealthTrend, redactHealthSource, healthTimeline, healthAssessmentResult } from '../src/health/health-report.js'
import { healthReceiptFindings, validHealthFindings } from '../src/health/health-findings.js'
const source = (paths: string[]) => ({ sourceSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), branch: 'main', fullName: 'test/repo', complete: true, warnings: [], files: paths.map(path => ({ path,sha:'c'.repeat(40),size:10 })) })
const sarif = (results: unknown[]) => Buffer.from(JSON.stringify({ version:'2.1.0', $schema:'https://json.schemastore.org/sarif-2.1.0.json',runs:[{ tool:{driver:{name:'fixture'}},results }] }))
const result = (title = 'Unsafe expression', path = 'src/app.ts', line = 4) => ({ ruleId:'fixture.rule',level:'error',message:{text:title},locations:[{physicalLocation:{artifactLocation:{uri:path},region:{startLine:line}}}] })
function extract(bytes: Buffer, secret = false) { return healthReceiptFindings(bytes.toString('base64'),createHash('sha256').update(bytes).digest('hex'),secret) }
describe('repository health evidence', () => {
 it('chooses static applicable analyzers without executing project scripts or tests', () => {
  expect(applicableHealthAnalyses(source(['README.md'])).map(a=>a.id)).toEqual(['secrets.scan'])
  expect(applicableHealthAnalyses(source(['src/app.ts','pnpm-lock.yaml','k8s/deployment.yaml'])).map(a=>a.id)).toEqual(['secrets.scan','security.sast','security.dependencies','iac.policy','quality.reliability','quality.maintainability','quality.duplication','security.hotspots'])
 })
 it('makes unavailable execution a partial inspection, never zero-issue health', () => {
  const report = healthReport({ complete:true,fileCount:3,languages:['TypeScript'] },[{id:'security.sast',title:'SAST',state:'UNAVAILABLE',reason:'REVIEW_REQUIRED'}])
  expect(report.mode).toBe('INSPECTION_ONLY'); expect(report.completeness).toBe('PARTIAL'); expect(report.limits.join(' ')).toContain('No analyzer ran')
 })
 it('normalizes real SARIF locations, hides secret messages and enforces payload bounds', () => {
  const bytes=sarif([result()]), findings=extract(bytes)!
  expect(findings[0]).toMatchObject({path:'src/app.ts',line:4,severity:'high',title:'Unsafe expression'})
  expect(extract(sarif([result('password=really-secret-value')]),true)![0].title).not.toContain('really-secret')
  expect(extract(sarif(Array.from({length:90},()=>result('x'.repeat(200),'src/'+'x'.repeat(490)))) )!.length).toBe(90)
  expect(extract(Buffer.from('{}'))).toBeUndefined()
  expect(healthReceiptFindings(bytes.toString('base64'),'b'.repeat(64),false)).toBeUndefined()
 })
 it('rejects malicious paths, extra fields, unbounded lines and credential-bearing messages', () => {
  const good=extract(sarif([result()]))![0]
  for(const patch of [{path:'../secrets'},{path:'%2e%2e/x'},{path:'https://evil/x'},{line:-1},{line:1000001},{title:'Bearer secret'},{html:'<script>'}]) expect(validHealthFindings([{...good,...patch}])).toBe(false)
 })
 it('deduplicates findings but preserves partial and truncation coverage', () => {
  const f=extract(sarif([result()]))![0]
  const check:any={ruleId:'security.sast',state:'FAIL',reason:'FINDINGS_REPORTED',coverage:'PARTIAL',cleanupConfirmed:true,summary:{results:1},findings:[f,f],reportHash:'a'.repeat(64)}
  const report=healthReport({complete:true,fileCount:1,languages:[]},[{id:check.ruleId,title:'SAST',state:'UNAVAILABLE',reason:'READY'}],[check])
  expect(report.findings).toHaveLength(1); expect(report.completeness).toBe('PARTIAL')
  check.coverage='FULL_RULE';check.findings=[f]; const complete=healthReport(report.inspection,report.analyses,[check],'same')
  expect(complete.completeness).toBe('COMPLETE');expect(comparableHealthTrend(complete,{...complete,findings:[]})).toEqual({introduced:1,noLongerReported:0})
  expect(comparableHealthTrend(complete,{...complete,comparisonKey:'other'})).toBeNull()
  check.summary.results=2;expect(healthReport(report.inspection,report.analyses,[check]).completeness).toBe('PARTIAL')
 })
 it('redacts credentials and private keys from surrounding code', () => {
  expect(redactHealthSource('const ok = 1;\npassword="secretvalue"\n-----BEGIN PRIVATE KEY-----\nprivate material\n-----END PRIVATE KEY-----\nconst end = 2;')).toBe('const ok = 1;\n[Sensitive source line hidden]\n[Sensitive source line hidden]\n[Sensitive source line hidden]\n[Sensitive source line hidden]\nconst end = 2;')
 })
})

it('does not convert a failed or invalid analyzer output into a zero finding count', () => {
 const report=healthReport({complete:true,fileCount:1,languages:[]},[{id:'security.sast',title:'SAST',state:'UNAVAILABLE',reason:'READY'}],[{ruleId:'security.sast',state:'INCOMPLETE',reason:'REPORT_INVALID',coverage:'PARTIAL',cleanupConfirmed:true,summary:null,findings:undefined} as any])
 expect(report.completeness).toBe('PARTIAL');expect(report.analyses[0].findingsRetained).toBeUndefined()
})

it('uses the fixed adapter category instead of report-provided classifications', () => {
 const bytes=sarif([result()]), hash=createHash('sha256').update(bytes).digest('hex')
 for (const category of ['reliability','maintainability'] as const) {
  const findings=healthReceiptFindings(bytes.toString('base64'),hash,false,category)!
  expect(findings[0]).toMatchObject({category,path:'src/app.ts',line:4})
  expect(validHealthFindings(findings)).toBe(true)
 }
 expect(validHealthFindings([{...extract(bytes)![0],category:'healthy'}])).toBe(false)
 expect(applicableHealthAnalyses(source(['Main.java'])).map(a=>a.id)).not.toContain('quality.reliability')
})

it('bounds saved analyzer rule help within the signed finding payload',()=>{
 const report=JSON.parse(sarif([result()]).toString())
 report.runs[0].tool.driver.rules=[{id:'fixture.rule',help:{text:'x'.repeat(2000)}}]
 const rows=extract(Buffer.from(JSON.stringify(report)))!
 expect(rows).toHaveLength(1)
 expect(rows[0].reportGuidance).toEqual({version:1,source:'ANALYZER_REPORT',advice:'x'.repeat(500)})
 expect(validHealthFindings(rows)).toBe(true)
})

it('does not claim code analysis for languages absent from the packaged rule configuration',()=>{
 for(const path of ['Main.java','main.go','app.rb','index.php','Program.cs']) {
  const ids=applicableHealthAnalyses(source([path])).map(a=>a.id)
  expect(ids).not.toContain('security.sast')
  expect(ids).not.toContain('quality.reliability')
  expect(ids).not.toContain('quality.maintainability')
  expect(ids).not.toContain('security.hotspots')
  expect(ids).toContain('quality.duplication')
 }
 for(const path of ['app.ts','app.js','app.mjs','app.cjs','app.py']) expect(applicableHealthAnalyses(source([path])).map(a=>a.id)).toContain('security.sast')
})
it('stores precise analysis scope and preserves a captured scope across report finalization',()=>{
 const analyses=[{id:'quality.reliability',title:'Reliability',state:'UNAVAILABLE',reason:'READY'}]
 const report=healthReport({complete:true,fileCount:1,languages:['TypeScript']},analyses)
 expect(report.analyses[0].scope).toContain('NaN comparisons')
 expect(report.analyses[0].scope).toContain('do not measure overall')
 const captured={...report.analyses[0],scope:'Captured rules from the original plan'}
 expect(healthReport(report.inspection,[captured]).analyses[0].scope).toBe(captured.scope)
 expect(analyses[0]).not.toHaveProperty('scope')
})

it('accepts only bounded duplication matches and removes them from other or secret outputs',()=>{
 const raw=JSON.parse(sarif([result()]).toString())
 raw.runs[0].results[0].relatedLocations=[{physicalLocation:{artifactLocation:{uri:'other.ts'},region:{startLine:2,endLine:6}}}]
 const bytes=Buffer.from(JSON.stringify(raw)),hash=createHash('sha256').update(bytes).digest('hex')
 const rows=healthReceiptFindings(bytes.toString('base64'),hash,false,'duplication')!
 expect(rows[0].relatedLocations).toEqual([{path:'other.ts',line:2,endLine:6}])
 expect(validHealthFindings(rows)).toBe(true)
 for(const patch of [{path:'../private',line:1,endLine:2},{path:'file:///private',line:1,endLine:2},{path:'other.ts',line:2,endLine:1},{path:'other.ts',line:1,endLine:1000001},{path:'other.ts',line:1,endLine:2,fragment:'source'}]) expect(validHealthFindings([{...rows[0],relatedLocations:[patch]}])).toBe(false)
 expect(validHealthFindings([{...rows[0],relatedLocations:Array(4).fill(rows[0].relatedLocations![0])}])).toBe(false)
 for(const [secret,category] of [[true,'duplication'],[false,'security']] as const) expect(healthReceiptFindings(bytes.toString('base64'),hash,secret,category)![0]).not.toHaveProperty('relatedLocations')
})

it('compares fully retained measured rule packs without claiming complete engineering coverage',()=>{
 const finding=extract(sarif([result()]))![0]
 const check:any={ruleId:'security.sast',state:'FAIL',reason:'FINDINGS_REPORTED',coverage:'PARTIAL',cleanupConfirmed:true,
  summary:{results:1,suppressed:0},findings:[finding],reportHash:'a'.repeat(64),toolVersion:'1',configHash:'b'.repeat(64),
  fileAnalysis:{version:1,formula:'semgrep-candidate-files-v1',scope:'js-ts-python',candidateFiles:1,analyzedFiles:1,skippedFiles:0,pathsDigest:'c'.repeat(64)}}
 const make=(c:any)=>healthReport({complete:true,fileCount:3,languages:[]},[{id:c.ruleId,title:'SAST',state:'READY',reason:'READY'}],[c],'fixed-plan')
 const report=make(check),prior=make({...check,state:'PASS',summary:{results:0},findings:[]})
 expect(report.completeness).toBe('PARTIAL')
 expect(comparableHealthTrend(report,prior)).toEqual({introduced:1,noLongerReported:0,checkIds:['security.sast']})
 expect(healthTimeline(report,[{id:'previous',state:'COMPLETED',sourceSha:'a'.repeat(40),finishedAt:new Date(0),report:prior}])[0]).toMatchObject({findings:0,checkIds:['security.sast']})
 for(const patch of [{summary:{results:2}},{state:'INCOMPLETE'},{cleanupConfirmed:false},{fileAnalysis:{...check.fileAnalysis,skippedFiles:1,candidateFiles:2}},
  {fileAnalysis:undefined},{toolVersion:'2'},{configHash:'d'.repeat(64)},{fileAnalysis:{...check.fileAnalysis,pathsDigest:'d'.repeat(64)}}]) {
  expect(comparableHealthTrend(report,make({...check,...patch}))).toBeNull()
 }
 expect(comparableHealthTrend(report,{...prior,findingComparison:undefined})).toBeNull()
})

it('rejects unsafe signed rule guidance and excludes all secret-rule advice',()=>{
 const report=JSON.parse(sarif([result()]).toString())
 report.runs[0].tool.driver.rules=[{id:'fixture.rule',fullDescription:{text:'Potential defect description'},help:{text:'Review and fix the exact reported rule'}}]
 const raw=Buffer.from(JSON.stringify(report)),rows=extract(raw)!
 expect(rows[0].reportGuidance?.explanation).toBe('Potential defect description')
 expect(extract(raw,true)![0]).not.toHaveProperty('reportGuidance')
 for(const patch of [{version:2},{source:'VERIFIED'},{advice:'x'.repeat(501)},{advice:'password=secretvalue'},{url:'https://example.com'},{advice:''}]) {
  expect(validHealthFindings([{...rows[0],reportGuidance:{...rows[0].reportGuidance,...patch}}])).toBe(false)
 }
})

it('marks only completed, fully analyzed clean passing scope as healthy',()=>{
 const report:any={mode:'EXECUTED',completeness:'COMPLETE',inspection:{complete:true},findings:[],analyses:[{id:'security.sast',state:'PASS',findingsRetained:0,findingsReported:0}]}
 expect(healthAssessmentResult(report,'COMPLETED')).toBe('PASS')
 for(const patch of [{mode:'INSPECTION_ONLY'},{completeness:'PARTIAL'},{inspection:{complete:false}},{analyses:[]},{analyses:[{state:'PASS'}]},{analyses:[{state:'UNAVAILABLE'}]}]) expect(healthAssessmentResult({...report,...patch},'COMPLETED')).toBe('INCOMPLETE')
 expect(healthAssessmentResult({...report,analyses:[{state:'FAIL'}]},'COMPLETED')).toBe('FAIL')
 expect(healthAssessmentResult({...report,findings:[{fingerprint:'issue'}]},'COMPLETED')).toBe('FAIL')
 expect(healthAssessmentResult(report,'RUNNING')).toBeNull()
 expect(healthAssessmentResult(null,'COMPLETED')).toBe('INCOMPLETE')
})
