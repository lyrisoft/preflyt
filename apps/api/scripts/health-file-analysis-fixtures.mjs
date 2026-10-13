// Trusted generated source only. Not independent production runtime qualification.
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,chmodSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
const image=process.env.PREFLYT_FILE_ANALYSIS_IMAGE
assert.match(image??'',/^sha256:[a-f0-9]{64}$/)
const root=mkdtempSync(resolve(tmpdir(),'preflyt-file-accounting-'))
try{
 for(const kind of ['complete','ignored','parse-error','empty-scope']) {
  const source=resolve(root,kind),reports=resolve(root,kind+'-reports');mkdirSync(source);mkdirSync(reports);chmodSync(reports,0o777)
  if(kind==='empty-scope')writeFileSync(resolve(source,'large.js'),'const good = 1;\n'.repeat(80000))
  else {
   writeFileSync(resolve(source,'app.js'),kind==='ignored'?'const good = 1;\n':'const bad = value === NaN;\n')
   writeFileSync(resolve(source,kind==='parse-error'?'broken.py':'other.js'),kind==='parse-error'?'def broken(:\n    return (\n':'const good = 1;\n')
   if(kind==='ignored')writeFileSync(resolve(source,'.semgrepignore'),'other.js\n')
  }
  const result=spawnSync('docker',['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','1g','--cpus','1','--tmpfs','/tmp:rw,nosuid,nodev,size=128m','--env','HOME=/tmp','--env','SEMGREP_SEND_METRICS=off','--env','SEMGREP_ENABLE_VERSION_CHECK=0','--mount',`type=bind,source=${source},target=/workspace,readonly`,'--mount',`type=bind,source=${reports},target=/reports`,'--entrypoint','/usr/local/bin/node',image,'/opt/preflyt/semgrep-measure.mjs','quality.reliability'],{encoding:'utf8',timeout:120000,maxBuffer:1048576})
  assert.equal(result.error,undefined)
  const report=JSON.parse(readFileSync(resolve(reports,'report.sarif'),'utf8')),properties=report.runs[0].properties,measurement=properties?.preflytFileAnalysis
  if(kind==='parse-error') {assert.equal(result.status,2);assert.equal(measurement,undefined);assert.equal(properties.preflytFileAnalysisUnavailable,'SCAN_ERRORS');assert.ok(report.runs[0].results.length>0)}
  else if(kind==='empty-scope'){assert.equal(result.status,0);assert.equal(measurement.candidateFiles,0);assert.equal(measurement.analyzedFiles,0)}
  else {assert.equal(result.status,kind==='complete'?1:0);assert.equal(measurement.candidateFiles,2);assert.equal(measurement.analyzedFiles,kind==='complete'?2:1);assert.equal(measurement.skippedFiles,kind==='complete'?0:1)}
  console.log(`${kind}: actual file accounting verified`)
 }
}finally{rmSync(root,{recursive:true,force:true})}
