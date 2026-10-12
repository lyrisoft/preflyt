import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { normalizeReportFindings } from '../src/findings/normalize-report-findings.js'
const parse = (format: string, text: string) => normalizeReportFindings(format, Buffer.from(text), createHash('sha256').update(text).digest('hex'))
const sarif = (results: object[]) => JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 'scanner' } }, results }] })
it('retains exact file evidence and stable finding identities without claiming independent verification', () => {
  const text = sarif([{ ruleId: 'injection', level: 'error', message: { text: 'Unsafe query' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'src/db.ts' }, region: { startLine: 4 } } }] }])
  expect(parse('sarif', text)[0]).toMatchObject({ severity: 'high', path: 'src/db.ts', line: 4, title: 'Unsafe query', suppressed: false })
  expect(parse('sarif', text)[0].fingerprint).toBe(parse('sarif', text)[0].fingerprint)
})
it('redacts credential messages and rejects encoded traversal paths', () => {
  const rows = parse('sarif', sarif([{ message: { text: 'api_key=very-private' }, locations: [{ physicalLocation: { artifactLocation: { uri: '%2e%2e/private' } } }] }]))
  expect(rows[0]).toMatchObject({ path: null, title: 'Sensitive report details omitted' })
})
it('projects failed nested tests without exposing failure logs or passing tests', () => {
  expect(parse('junit', '<testsuites><testsuite><testcase name="passing"/><testsuite><testcase name="failing" file="src/test.ts"><failure>private-token</failure></testcase></testsuite></testsuite></testsuites>')).toEqual([expect.objectContaining({ title: 'failing', path: 'src/test.ts', category: 'tests' })])
})
it('rejects altered reports and XML entities before projection', () => {
  expect(() => normalizeReportFindings('sarif', Buffer.from(sarif([])), '0'.repeat(64))).toThrow()
  expect(() => parse('junit', '<!DOCTYPE testsuite [<!ENTITY x SYSTEM "file:///etc/passwd">]><testsuite/>')).toThrow()
})
it('retains a supplied code range without changing the stable finding identity',()=>{
 const result={ruleId:'range',message:{text:'Issue'},locations:[{physicalLocation:{artifactLocation:{uri:'src/app.ts'},region:{startLine:4,endLine:8}}}]}
 const withRange=parse('sarif',sarif([result]))[0]
 expect(withRange).toMatchObject({line:4,endLine:8})
 result.locations[0].physicalLocation.region.endLine=4
 expect(parse('sarif',sarif([result]))[0].fingerprint).toBe(withRange.fingerprint)
})

const guidedReport=(rules:any[],result:any={ruleId:'injection',level:'error',message:{text:'Unsafe query'}})=>JSON.stringify({version:'2.1.0',runs:[{tool:{driver:{name:'scanner',rules}},results:[result]}]})
it('projects bounded plain-text rule explanation and help from the saved report',()=>{
 const row=parse('sarif',guidedReport([{id:'injection',fullDescription:{text:'Input reaches a query.'},help:{text:'Use bound parameters.\nTest invalid input.',markdown:'<script>ignored</script>'}}]))[0]
 expect(row.reportGuidance).toEqual({version:1,source:'ANALYZER_REPORT',explanation:'Input reaches a query.',advice:'Use bound parameters.\nTest invalid input.'})
 expect(row.fingerprint).toBe(parse('sarif',sarif([{ruleId:'injection',level:'error',message:{text:'Unsafe query'}}]))[0].fingerprint)
})
it('omits secrets and never resolves external help or Markdown-only rule content',()=>{
 for(const text of ['Bearer confidential','api_key=confidential','github_pat_abcdefghijk','-----BEGIN PRIVATE KEY-----']) {
  expect(parse('sarif',guidedReport([{id:'injection',fullDescription:{text},help:{text}}]))[0].reportGuidance).toBeUndefined()
 }
 expect(()=>parse('sarif',guidedReport([{id:'injection',help:{markdown:'**Advice**'}}]))).toThrow()
 expect(parse('sarif',guidedReport([{id:'injection',helpUri:'https://example.com'}]))[0].reportGuidance).toBeUndefined()
 const row=parse('sarif',guidedReport([{id:'injection',help:{text:'x'.repeat(5000)}}]))[0]
 expect(row.reportGuidance!.advice).toHaveLength(2000)
})
it('does not attach another or ambiguous rule explanation',()=>{
 const rule={id:'injection',fullDescription:{text:'Rule explanation'}}
 expect(parse('sarif',guidedReport([{...rule,id:'different'}]))[0].reportGuidance).toBeUndefined()
 expect(()=>parse('sarif',guidedReport([rule,rule]))).toThrow()
 const result={ruleId:'injection',ruleIndex:1,message:{text:'Unsafe query'}}
 expect(parse('sarif',guidedReport([rule,{id:'other'}],result))[0].reportGuidance).toBeUndefined()
 expect(parse('sarif',guidedReport([rule],{...result,ruleIndex:0}))[0].reportGuidance!.explanation).toBe('Rule explanation')
})

it('retains bounded related ranges without changing finding identity',()=>{
 const loc=(uri:string,startLine:number,endLine=startLine)=>({physicalLocation:{artifactLocation:{uri},region:{startLine,endLine}}})
 const base={ruleId:'duplicates',message:{text:'Repeated block'},locations:[loc('first.js',1,10)]}
 const related=[loc('../private',1),loc('first.js',1,10),loc('second.js',2,11),loc('second.js',2,11),loc('third.js',4,13),loc('fourth.js',5,14),loc('fifth.js',6,15)]
 const row=parse('sarif',sarif([{...base,relatedLocations:related.map((location,id)=>({...location,id}))}]))[0]
 expect(row.relatedLocations).toEqual([{path:'second.js',line:2,endLine:11},{path:'third.js',line:4,endLine:13},{path:'fourth.js',line:5,endLine:14}])
 expect(row.fingerprint).toBe(parse('sarif',sarif([base]))[0].fingerprint)
})

const junitFailure=(body:string,attributes='')=>`<testsuite><testcase name="test_product_name_is_literal_input" ${attributes}><failure>${body}</failure></testcase></testsuite>`
it('extracts the failing test traceback frame and preserves existing identities and redaction',()=>{
 const row=parse('junit',junitFailure('Traceback (most recent call last):\n  File &quot;test_catalogue.py&quot;, line 32, in test_product_name_is_literal_input\n    private-sensitive-failure-text'))[0]
 expect(row).toMatchObject({path:'test_catalogue.py',line:32,endLine:32})
 expect(row.fingerprint).toBe(parse('junit',junitFailure('No location'))[0].fingerprint)
 expect(JSON.stringify(row)).not.toContain('private-sensitive-failure-text')
 const trace='  File "framework.py", line 2, in runner\n  File "tests/test_catalogue.py", line 32, in test_product_name_is_literal_input\n  File "catalogue.py", line 11, in find_product'
 expect(parse('junit',junitFailure(trace))[0]).toMatchObject({path:'tests/test_catalogue.py',line:32})
})
it('supports explicit JUnit coordinates and pytest locations without guessing ambiguous paths',()=>{
 expect(parse('junit',junitFailure('ignored','file="tests/test.py" line="12"'))[0]).toMatchObject({path:'tests/test.py',line:12})
 expect(parse('junit',junitFailure('tests/test.py:12: AssertionError'))[0]).toMatchObject({path:'tests/test.py',line:12})
 expect(parse('junit',junitFailure('File "one.py", line 3, in first\nFile "two.py", line 4, in second'))[0]).toMatchObject({path:null,line:null})
 expect(parse('junit',junitFailure('File "other.py", line 3, in helper','file="tests/test.py"'))[0]).toMatchObject({path:'tests/test.py',line:null})
})
it('rejects unsafe traceback paths, invalid coordinates and malformed explicit locations',()=>{
 for(const path of ['../private.py','%2e%2e/private.py','/etc/private.py','https://example.com/file.py','C:\\private.py']) {
  expect(parse('junit',junitFailure(`File "${path}", line 32, in test_product_name_is_literal_input`))[0]).toMatchObject({path:null,line:null})
 }
 for(const line of ['0','1000001','999999999999']) expect(parse('junit',junitFailure(`File "test.py", line ${line}, in test_product_name_is_literal_input`))[0]).toMatchObject({path:null,line:null})
 expect(parse('junit',junitFailure('File "safe.py", line 3, in test_product_name_is_literal_input','file="../private.py"'))[0]).toMatchObject({path:null,line:null})
})


it('does not present repeated SARIF help text as a separate problem explanation',()=>{
 const advice='Use parameterized SQL instead of interpolating user input into a query.'
 const result={ruleId:'sql-string-interpolation',message:{text:advice}}
 const row=parse('sarif',guidedReport([{id:result.ruleId,fullDescription:{text:advice},help:{text:advice}}],result))[0]
 expect(row.reportGuidance).toEqual({version:1,source:'ANALYZER_REPORT',advice})
 expect(row.title).toBe(advice)
 expect(row.fingerprint).toBe(parse('sarif',sarif([result]))[0].fingerprint)
})


it('deduplicates description/help for arbitrary analyzer rules rather than one SQL rule',()=>{
 for(const id of ['custom-security','custom-reliability','custom-maintainability','custom-duplication']) {
  const advice='Replace unsafe handling.'
  const result={ruleId:id,message:{text:'Reported issue'}}
  const row=parse('sarif',guidedReport([{id,fullDescription:{text:'REPLACE   unsafe handling!'},help:{text:advice}}],result))[0]
  expect(row.reportGuidance).toEqual({version:1,source:'ANALYZER_REPORT',advice})
 }
})
