import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import {nativeRunnerReport} from '../src/execution/native-runner-report.js'
import {nativeCheckOutcome} from '../src/execution/native-result.js'
import {parseArtifact} from '../src/github-events/ci-artifact-parser.js'
import {healthReceiptFindings} from '../src/health/health-findings.js'
import {fileAnalysisErrors,validScanErrors} from '../src/health/health-file-analysis.js'

it('retains a large static report end to end while keeping CI import limits',()=>{
 const results=Array.from({length:1000},(_,i)=>({ruleId:'example',level:'warning',message:{text:'Review this dependency. '.repeat(10)},locations:[{physicalLocation:{artifactLocation:{uri:'package-lock.json'},region:{startLine:i+1}}}]}))
 const bytes=Buffer.from(JSON.stringify({version:'2.1.0',runs:[{tool:{driver:{name:'fixture'}},results}]})), hash=createHash('sha256').update(bytes).digest('hex')
 expect(bytes.length).toBeGreaterThan(262144)
 const envelope=Buffer.from(JSON.stringify({version:2,sourceHash:'a'.repeat(64),exitCode:1,report:bytes.toString('base64')}))
 expect(nativeRunnerReport(envelope,'a'.repeat(64),1,true)).toEqual(bytes)
 expect(()=>nativeRunnerReport(envelope,'a'.repeat(64),1)).toThrow()
 expect(()=>parseArtifact('sarif',bytes.toString(),hash)).toThrow()
 expect(nativeCheckOutcome('security.dependencies',1,bytes,'health')).toMatchObject({state:'FAIL',summary:{results:1000}})
 expect(healthReceiptFindings(bytes.toString('base64'),hash,false)).toHaveLength(1000)
 expect(nativeCheckOutcome('security.dependencies',2,bytes,'health').state).toBe('INCOMPLETE')
})
it('does not accept corrupted large envelopes or unbounded static output',()=>{
 const envelope=(report:string)=>Buffer.from(JSON.stringify({version:2,sourceHash:'a'.repeat(64),exitCode:0,report}))
 expect(()=>nativeRunnerReport(envelope('not base64!'),'a'.repeat(64),0,true)).toThrow()
 expect(()=>nativeRunnerReport(envelope(Buffer.alloc(8*1024*1024+1).toString('base64')),'a'.repeat(64),0,true)).toThrow()
})
it('describes known secret types without persisting detector messages or matching values',()=>{
 const value='credential-that-must-never-be-visible'
 const bytes=Buffer.from(JSON.stringify({version:'2.1.0',runs:[{tool:{driver:{name:'Gitleaks'}},results:['generic-api-key','curl-auth-header'].map(ruleId=>({ruleId,message:{text:value},locations:[{physicalLocation:{artifactLocation:{uri:'tests/fixture.js'},region:{startLine:3}}}]}))}]}))
 const rows=healthReceiptFindings(bytes.toString('base64'),createHash('sha256').update(bytes).digest('hex'),true)!
 expect(rows).toHaveLength(2)
 expect(rows.map(row=>row.severity).sort()).toEqual(['high','medium'])
 expect(rows.every(row=>row.title.startsWith('Potential'))).toBe(true)
 expect(JSON.stringify(rows)).not.toContain(value)
})
it('only accepts bounded checksum-bound scanner diagnostics without raw source or messages',()=>{
 const errors=[{type:'PartialParsing',path:'src/app.ts',line:104}]
 const bytes=Buffer.from(JSON.stringify({version:'2.1.0',runs:[{properties:{preflytScanErrors:errors}}]})),hash=createHash('sha256').update(bytes).digest('hex')
 expect(fileAnalysisErrors(bytes.toString('base64'),hash)).toEqual(errors)
 expect(fileAnalysisErrors(bytes.toString('base64'),'f'.repeat(64))).toBeUndefined()
 for(const value of [[{type:'Timeout',path:'../secret'}],[{type:'Error',path:'file.js',message:'raw source'}],Array(31).fill(errors[0]),[{...errors[0],line:0}],[{...errors[0],path:null}]])expect(validScanErrors(value)).toBe(false)
})
