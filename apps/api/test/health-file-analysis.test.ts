import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import {validFileAnalysis,fileAnalysisMeasurement,fileAnalysisFailureReason} from '../src/health/health-file-analysis.js'
import {healthReport} from '../src/health/health-report.js'
const m={version:1,formula:'semgrep-candidate-files-v1',scope:'js-ts-python',candidateFiles:3,analyzedFiles:2,skippedFiles:1,pathsDigest:'a'.repeat(64)} as const
it('validates bounded actual file counters without accepting supplied percentages or source',()=>{
 expect(validFileAnalysis(m)).toBe(true)
 for(const patch of [{candidateFiles:2001},{analyzedFiles:4},{skippedFiles:0},{analyzedFiles:-1},{candidateFiles:1.5},{scope:'whole-repository'},{percentage:100},{paths:['private.js']},{pathsDigest:'not-a-digest'}])expect(validFileAnalysis({...m,...patch})).toBe(false)
})
it('reads counts only from checksum-bound Semgrep reports',()=>{
 const bytes=Buffer.from(JSON.stringify({version:'2.1.0',runs:[{tool:{driver:{name:'Semgrep OSS'}},properties:{preflytFileAnalysis:m},results:[]}]})),hash=createHash('sha256').update(bytes).digest('hex')
 expect(fileAnalysisMeasurement(bytes.toString('base64'),hash)).toEqual(m)
 expect(fileAnalysisMeasurement(bytes.toString('base64'),'f'.repeat(64))).toBeUndefined()
 const other=Buffer.from(bytes.toString().replace('Semgrep OSS','unreviewed tool'))
 expect(fileAnalysisMeasurement(other.toString('base64'),createHash('sha256').update(other).digest('hex'))).toBeUndefined()
})
it('keeps discovered files and measured analysis separate and withholds failed or unclean results',()=>{
 const inspection={complete:true,fileCount:100,languages:['JavaScript']},analyses=[{id:'security.sast',title:'SAST',state:'READY',reason:'READY'}]
 const check:any={ruleId:'security.sast',state:'FAIL',reason:'FINDINGS_REPORTED',coverage:'PARTIAL',cleanupConfirmed:true,findings:[],summary:{results:0},fileAnalysis:m}
 const report=healthReport(inspection,analyses,[check])
 expect(report.inspection.fileCount).toBe(100)
 expect(report.analyses[0].fileAnalysis).toEqual(m)
 for(const patch of [{state:'INCOMPLETE'},{cleanupConfirmed:false},{fileAnalysis:{...m,analyzedFiles:20}}]) expect(healthReport(inspection,analyses,[{...check,...patch}]).analyses[0].fileAnalysis).toBeUndefined()
 expect(healthReport(inspection,analyses).analyses[0].fileAnalysis).toBeUndefined()
})

it('does not carry prior or other-analyzer counters into an unmeasured report',()=>{
 const inspection={complete:true,fileCount:100,languages:['JavaScript']}
 const prior={id:'security.sast',title:'SAST',state:'PASS',reason:'READY',fileAnalysis:m}
 expect(healthReport(inspection,[prior]).analyses[0].fileAnalysis).toBeUndefined()
 const other:any={ruleId:'secrets.scan',state:'PASS',reason:'CHECKS_PASSED',cleanupConfirmed:true,fileAnalysis:m,findings:[],summary:{results:0},coverage:'FULL_RULE'}
 expect(healthReport(inspection,[{...prior,id:other.ruleId}],[other]).analyses[0].fileAnalysis).toBeUndefined()
})
it('accepts only checksum-bound bounded scan failure labels',()=>{
 const raw=Buffer.from(JSON.stringify({version:'2.1.0',runs:[{tool:{driver:{name:'Semgrep OSS'}},properties:{preflytFileAnalysisUnavailable:'SCAN_ERRORS'},results:[]}]})),hash=createHash('sha256').update(raw).digest('hex')
 expect(fileAnalysisFailureReason(raw.toString('base64'),hash)).toBe('FILE_ANALYSIS_SCAN_ERRORS')
 expect(fileAnalysisFailureReason(raw.toString('base64'),'f'.repeat(64))).toBeUndefined()
})
