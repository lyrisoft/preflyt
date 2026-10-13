import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import {duplicationMeasurement,validDuplicationMeasurement} from '../src/health/health-measurements.js'
import {healthReport} from '../src/health/health-report.js'
import {healthReceiptFindings,validHealthFindings} from '../src/health/health-findings.js'
const measurement={version:1,kind:'duplication',formula:'unique-lines-v1',analyzedLines:100,duplicatedLines:20,analyzedFiles:2,clonePairs:1,minimumLines:5,minimumTokens:50,mode:'weak'} as const
const bytes=()=>Buffer.from(JSON.stringify({
 version:'2.1.0',
 runs:[{
  tool:{driver:{name:'Preflyt duplication'}},
  properties:{preflytMeasurement:measurement},
  results:[{
   ruleId:'preflyt-duplicate-block-v1',level:'note',message:{text:'Review this repeated code block.'},
   locations:[{physicalLocation:{artifactLocation:{uri:'app.ts'},region:{startLine:4,endLine:13}}}],
  }],
 }],
}))
it('extracts checksum-bound measured counters and rejects arbitrary scores or invalid denominators',()=>{
 const data=bytes(),hash=createHash('sha256').update(data).digest('hex')
 expect(duplicationMeasurement(data.toString('base64'),hash)).toEqual(measurement)
 expect(duplicationMeasurement(data.toString('base64'),'f'.repeat(64))).toBeUndefined()
 for(const patch of [{percentage:20},{duplicatedLines:101},{analyzedLines:-1},{analyzedFiles:101},{analyzedFiles:0},{clonePairs:0},{duplicatedLines:0},{analyzedLines:1.5},{formula:'made-up'}]) expect(validDuplicationMeasurement({...measurement,...patch})).toBe(false)
})
it('retains complete duplicate block ranges but rejects invalid ranges',()=>{
 const data=bytes(),hash=createHash('sha256').update(data).digest('hex')
 const findings=healthReceiptFindings(data.toString('base64'),hash,false,'duplication')!
 expect(findings[0]).toMatchObject({category:'duplication',line:4,endLine:13})
 for(const endLine of [3,1000001,4.5]) expect(validHealthFindings([{...findings[0],endLine}])).toBe(false)
})
it('publishes measurements only from validated executed outcomes with cleanup',()=>{
 const check:any={ruleId:'quality.duplication',state:'FAIL',reason:'FINDINGS_REPORTED',cleanupConfirmed:true,measurement,coverage:'PARTIAL',summary:{results:2},findings:[]}
 const inspection={complete:true,fileCount:2,languages:['TypeScript']}
 const analyses=[{id:'quality.duplication',title:'Duplicated code',state:'READY',reason:'READY'}]
 expect(healthReport(inspection,analyses,[check]).measurements?.duplication).toEqual(measurement)
 expect(healthReport(inspection,analyses,[{...check,state:'INCOMPLETE'}]).measurements).toBeUndefined()
 expect(healthReport(inspection,analyses,[{...check,cleanupConfirmed:false}]).measurements).toBeUndefined()
 expect(healthReport(inspection,analyses,[{...check,measurement:{...measurement,duplicatedLines:200}}]).measurements).toBeUndefined()
})
