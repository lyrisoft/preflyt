// Generated, trusted code only. This is scanner acceptance, not execution qualification.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const image=process.env.PREFLYT_DUPLICATION_FIXTURE_IMAGE
assert.match(image??'',/^sha256:[a-f0-9]{64}$/)
const root=mkdtempSync(resolve(tmpdir(),'preflyt-duplication-'))
const block=`export function calculate(items) {
  let total = 0;
  for (const item of items) {
    if (item.active) {
      const subtotal = item.price * item.quantity;
      total += subtotal;
      if (item.discount > 0) {
        total -= subtotal * item.discount;
      }
    }
  }
  return Math.round(total * 100) / 100;
}
`
try {
 for(const kind of ['seeded','clean','ignored']) {
  const source=resolve(root,kind),reports=resolve(root,kind+'-reports')
  mkdirSync(source);mkdirSync(reports);chmodSync(reports,0o777)
  writeFileSync(resolve(source,'first.js'),block)
  if(kind==='seeded') {writeFileSync(resolve(source,'second.js'),block);writeFileSync(resolve(source,'third.js'),block)}
  if(kind==='ignored') {
   mkdirSync(resolve(source,'node_modules'));writeFileSync(resolve(source,'node_modules/copy.js'),block)
   // Repository-controlled settings must not change the reviewed scan or load code.
   writeFileSync(resolve(source,'.jscpd.json'),JSON.stringify({reporters:['evil'],path:['/etc'],minTokens:1}))
   writeFileSync(resolve(source,'package.json'),JSON.stringify({jscpd:{reporters:['evil']}}))
  }
  const run=spawnSync('docker',['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','1g','--cpus','1','--tmpfs','/tmp:rw,nosuid,nodev,size=128m',
   '--mount',`type=bind,source=${source},target=/workspace,readonly`,'--mount',`type=bind,source=${reports},target=/reports`, '--entrypoint','/usr/local/bin/node',image,'/opt/preflyt/duplication/scan.mjs'],{encoding:'utf8',timeout:120000,maxBuffer:1048576})
  assert.equal(run.error,undefined)
  assert.equal(run.status,kind==='seeded'?1:0,run.stderr)
  assert.ok(existsSync(resolve(reports,'report.sarif')), `Missing scanner output: ${run.stderr} ${run.stdout}`)
  const raw=readFileSync(resolve(reports,'report.sarif'),'utf8'),report=JSON.parse(raw),m=report.runs[0].properties.preflytMeasurement
  assert.equal(m.analyzedFiles,kind==='seeded'?3:1)
  assert.equal(m.analyzedLines,block.trimEnd().split('\n').length*m.analyzedFiles)
  assert.ok(!raw.includes('let total = 0'), 'Never retain source fragments')
  assert.equal(m.formula,'unique-lines-v1')
  const unique=new Set()
  for(const row of report.runs[0].results) {
   const loc=row.locations[0].physicalLocation
   assert.ok(loc.region.endLine>=loc.region.startLine)
   assert.ok(row.relatedLocations.length>0 && row.relatedLocations.length<=3)
   for(const related of row.relatedLocations) {
    const partner=related.physicalLocation
    assert.notDeepEqual(partner,loc)
    assert.ok(existsSync(resolve(source,partner.artifactLocation.uri)))
    assert.ok(partner.region.startLine>0 && partner.region.endLine>=partner.region.startLine)
    assert.ok(!related.fragment && !partner.contextRegion && !partner.region.snippet)
   }
   for(let line=loc.region.startLine;line<=loc.region.endLine;line++) unique.add(loc.artifactLocation.uri+':'+line)
  }
  assert.equal(m.duplicatedLines,unique.size)
  assert.ok(m.duplicatedLines<=m.analyzedLines)
  assert.equal(m.clonePairs>0,kind==='seeded')
  console.log(`${kind}: ${m.duplicatedLines}/${m.analyzedLines} unique duplicate lines, ${report.runs[0].results.length} source blocks`)
 }
} finally {rmSync(root,{recursive:true,force:true})}
