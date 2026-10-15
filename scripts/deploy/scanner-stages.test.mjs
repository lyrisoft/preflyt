import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {scannerStages,updateScannerStages,begin,end} from './scanner-stages.mjs'
test('bundled scanner stages match standalone native Dockerfiles',()=>{
 const source=readFileSync('deploy/api.Dockerfile','utf8')
 assert.equal(source.split(begin+'\n')[1].split(end)[0],scannerStages())
 const stages=scannerStages()
 assert.match(stages,/FROM bundle-dependencies-base AS bundle-dependencies/)
 assert.match(stages,/COPY --from=bundle-semgrep-node/)
 assert.match(stages,/COPY docs\/deployment\/native-runner\/runner.mjs/)
})

test('stage regeneration refuses malformed Dockerfile markers without truncating the source',()=>{
 for(const source of ['FROM scratch',end+'\n'+begin,begin+'\n'+begin+'\n'+end])assert.throws(()=>updateScannerStages(source,'generated\n'),/markers/)
 assert.equal(updateScannerStages('before\n'+begin+'\nold\n'+end+'\nafter','new\n'),'before\n'+begin+'\nnew\n'+end+'\nafter')
})
test('stage generation refuses to guess a missing Trivy target boundary',()=>{
 assert.throws(()=>scannerStages(()=> 'FROM node AS base\nFROM base AS dependencies\n'),/Trivy runtime/)
})
