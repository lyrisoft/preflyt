import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import {coverageMeasurement,validCoverageMeasurement,coverageFailureReason} from '../src/health/health-measurements.js'
import {applicableHealthAnalyses,healthReport,supportsNodeCoverage} from '../src/health/health-report.js'
const m={version:1,kind:'coverage',formula:'node-covered-lines-v1',scope:'node-loaded-files',analyzedLines:10,coveredLines:6,analyzedFiles:1,tests:2,passed:2,failed:0,skipped:0,cancelled:0,todo:0} as const
const snapshot=(paths:string[])=>({sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),branch:'main',fullName:'org/repo',complete:true,warnings:[],files:paths.map(path=>({path,sha:'c'.repeat(40),size:10}))})
it('never includes test execution in the default repository analysis',()=>{
 const source=snapshot(['app.js','app.test.js'])
 expect(supportsNodeCoverage(source)).toBe(true)
 expect(applicableHealthAnalyses(source).map(a=>a.id)).not.toContain('tests.coverage')
 expect(applicableHealthAnalyses(source,true).map(a=>a.id)).toContain('tests.coverage')
 expect(supportsNodeCoverage(snapshot(['app.test.ts','package.json']))).toBe(false)
 expect(supportsNodeCoverage(snapshot(['node_modules/app.test.js']))).toBe(false)
})
it('requires actual successful complete tests and a measured denominator',()=>{
 expect(validCoverageMeasurement(m)).toBe(true)
 for(const patch of [{tests:0,passed:0},{coveredLines:11},{analyzedLines:0},{analyzedFiles:0},{passed:1},{failed:1},{skipped:1},{cancelled:1},{todo:1},{scope:'all-repository-files'},{grade:'A'},{coveredLines:1.5}])expect(validCoverageMeasurement({...m,...patch})).toBe(false)
})
it('extracts only checksum-bound fixed wrapper coverage reports',()=>{
 const raw=Buffer.from(JSON.stringify({version:'2.1.0',runs:[{tool:{driver:{name:'Preflyt test coverage'}},properties:{preflytMeasurement:m},results:[]}]})),hash=createHash('sha256').update(raw).digest('hex')
 expect(coverageMeasurement(raw.toString('base64'),hash)).toEqual(m)
 expect(coverageMeasurement(raw.toString('base64'),'f'.repeat(64))).toBeUndefined()
})
it('publishes coverage only for successful cleanup-confirmed checks, independently of static findings',()=>{
 const check:any={ruleId:'tests.coverage',state:'PASS',reason:'CHECKS_PASSED',coverage:'PARTIAL',cleanupConfirmed:true,measurement:m,summary:{results:0},findings:[]}
 const inspection={complete:true,fileCount:2,languages:['JavaScript']},analyses=[{id:'tests.coverage',title:'Optional test coverage',state:'READY',reason:'READY'}]
 expect(healthReport(inspection,analyses,[check]).measurements?.coverage).toEqual(m)
 for(const patch of [{state:'FAIL'},{state:'INCOMPLETE'},{cleanupConfirmed:false},{measurement:{...m,skipped:1}}])expect(healthReport(inspection,analyses,[{...check,...patch}]).measurements?.coverage).toBeUndefined()
 expect(healthReport(inspection,analyses,[check]).completeness).toBe('PARTIAL')
})

it('retains only bounded checksum-verified failure reasons, never test messages',()=>{
 const data=Buffer.from(JSON.stringify({version:'2.1.0',runs:[{tool:{driver:{name:'Preflyt test coverage'}},properties:{preflytCoverageUnavailable:'TESTS_SKIPPED'},results:[]}]})),hash=createHash('sha256').update(data).digest('hex')
 expect(coverageFailureReason(data.toString('base64'),hash)).toBe('TESTS_SKIPPED')
 expect(coverageFailureReason(data.toString('base64'),'0'.repeat(64))).toBeUndefined()
})

it('does not mistake declared Vitest or Jest projects for the built-in Node recipe',()=>{
 for(const framework of ['vitest','jest','@jest/globals','@vitest/coverage-v8']) {
  const source=snapshot(['app.test.js','package.json'])
  Object.assign(source.files[1],{content:JSON.stringify({devDependencies:{[framework]:'1.0.0'}})})
  expect(supportsNodeCoverage(source)).toBe(false)
 }
 for(const config of ['vitest.config.ts','packages/app/jest.config.js']) expect(supportsNodeCoverage(snapshot(['app.test.js',config]))).toBe(false)
 for(const content of [undefined,'{bad',JSON.stringify({scripts:{test:'jest --coverage'}})]) {
  const source=snapshot(['app.test.js','package.json']);Object.assign(source.files[1],{content})
  expect(supportsNodeCoverage(source)).toBe(false)
 }
 const source=snapshot(['app.test.js','package.json']);Object.assign(source.files[1],{content:JSON.stringify({scripts:{test:'node --test'}})})
 expect(supportsNodeCoverage(source)).toBe(true)
})
