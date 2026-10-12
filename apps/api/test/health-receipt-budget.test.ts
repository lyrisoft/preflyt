import {generateKeyPairSync} from 'node:crypto'
import {expect,it} from 'vitest'
import {fitHealthReceipt} from '../src/health/health-receipt-budget.js'
import {signNativeReceipt} from '../src/execution/native-receipt.js'
const fixture=()=>({version:1,selectionId:'health:fixture',requestId:'id',attemptId:'attempt',organizationId:'org',repositoryId:'51',sourceSha:'a'.repeat(40),sourceHash:'b'.repeat(64),planHash:'c'.repeat(64),approvalHash:'d'.repeat(64),environmentId:'env',controlsHash:'e'.repeat(64),toolReviewHash:'f'.repeat(64),startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),cancelled:false,checks:Array.from({length:8},(_,index)=>({ruleId:'check-'+index,state:'FAIL',reason:'FINDINGS_REPORTED',reportHash:'a'.repeat(64),summary:{results:20,runs:1,suppressed:0},cleanupConfirmed:true,coverage:'PARTIAL',measurement:index===0?{kind:'duplication',analyzedLines:100,duplicatedLines:20}:undefined,findings:Array.from({length:20},(_,i)=>({fingerprint:String(i%10).repeat(64),category:'security',severity:i===0?'critical':'low',title:'x'.repeat(200),ruleId:'rule',path:'src/'+'x'.repeat(450)+'.js',line:i+1,suppressed:false}))}))}) as any
it('fits a multi-analyzer receipt while retaining useful findings from every analysis and original counters',()=>{
 const original=fixture(),before=structuredClone(original),fitted=fitHealthReceipt(original)
 expect(Buffer.from(JSON.stringify(fitted)).toString('base64url').length).toBeLessThanOrEqual(40000)
 expect(original).toEqual(before)
 for(const [i,check] of fitted.checks.entries()){
  expect(check.findings!.length).toBeGreaterThan(0);expect(check.findings!.length).toBeLessThan(20)
  expect(check.findings![0].severity).toBe('critical')
  expect(check.summary).toEqual(before.checks[i].summary)
  expect(check.measurement).toEqual(before.checks[i].measurement)
  expect(check.cleanupConfirmed).toBe(true)
 }
 const pair=generateKeyPairSync('ed25519')
 expect(()=>signNativeReceipt(fitted,pair.privateKey.export({type:'pkcs8',format:'pem'}).toString(),pair.publicKey.export({type:'spki',format:'pem'}).toString())).not.toThrow()
})
it('never silently alters normal CI receipt evidence or unbounded metadata',()=>{
 const value=fixture()
 expect(fitHealthReceipt({...value,selectionId:'policy'})).toEqual({...value,selectionId:'policy'})
 expect(()=>fitHealthReceipt({...value,checks:[],environmentId:'x'.repeat(40000)})).toThrow('metadata exceeds bounds')
})
