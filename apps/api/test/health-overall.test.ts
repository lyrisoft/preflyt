import {expect,it} from 'vitest'
import {overallHealth} from '../src/health/health-overall.js'
const clean:any={mode:'EXECUTED',completeness:'COMPLETE',inspection:{complete:true},findings:[],analyses:[{id:'security.sast',title:'Security',state:'PASS',findingsRetained:0,findingsReported:0}]}
it('uses latest recorded outcomes, not averages or lifecycle completion alone',()=>{
 expect(overallHealth(clean,'COMPLETED').status).toBe('HEALTHY')
 expect(overallHealth(null,'NOT_ASSESSED').status).toBe('NOT_ASSESSED')
 expect(overallHealth(clean,'RUNNING').status).toBe('RUNNING')
 expect(overallHealth(clean,'FAILED').status).toBe('INCOMPLETE')
 for(const patch of [{mode:'INSPECTION_ONLY'},{completeness:'PARTIAL'},{inspection:{complete:false}},{analyses:[]},{analyses:[{state:'PASS'}]}]) expect(overallHealth({...clean,...patch},'COMPLETED').status).toBe('INCOMPLETE')
})
it('never lets missing results hide known high or critical findings',()=>{
 for(const severity of ['high','critical']) expect(overallHealth({...clean,completeness:'PARTIAL',findings:[{severity}]},'COMPLETED').status).toBe('UNHEALTHY')
 for(const severity of ['medium','low','unknown']) expect(overallHealth({...clean,findings:[{severity}],analyses:[{...clean.analyses[0],state:'FAIL',findingsRetained:1,findingsReported:1}]},'COMPLETED').status).toBe('NEEDS_ATTENTION')
 expect(overallHealth({...clean,findings:[{severity:'high',suppressed:true}]},'COMPLETED').status).toBe('HEALTHY')
})
it('applies captured required failure limits and missing requirements without inventing percentage targets',()=>{
 const policyContext:any={state:'CAPTURED',healthRules:[{id:'security.sast',required:true,maxFailedChecks:0}]}
 expect(overallHealth({...clean,policyContext,analyses:[{...clean.analyses[0],state:'FAIL'}]},'COMPLETED').status).toBe('UNHEALTHY')
 expect(overallHealth({...clean,policyContext:{...policyContext,healthRules:[{id:'tests.coverage',required:true,maxFailedChecks:0}]}},'COMPLETED').status).toBe('INCOMPLETE')
 expect(overallHealth({...clean,policyContext:{...policyContext,state:'POLICY_INVALID'}},'COMPLETED').status).toBe('INCOMPLETE')
})
