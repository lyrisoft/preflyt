import type {NativeReceipt} from '../execution/native-receipt.js'
import {HEALTH_RECEIPT_PAYLOAD} from './health-report-limits.js'
const bytes=(value:NativeReceipt)=>Buffer.byteLength(JSON.stringify(value))
/** Keep bounded results in severity order without quadratic trimming for large repositories. */
export function fitHealthReceipt(value:NativeReceipt):NativeReceipt {
 const limit=Math.floor(HEALTH_RECEIPT_PAYLOAD*3/4)
 if(!value.selectionId.startsWith('health:')||bytes(value)<=limit)return value
 const fitted={...value,checks:value.checks.map(check=>({...check,...(check.findings?{findings:[] as typeof check.findings}:{})}))}
 let remaining=limit-bytes(fitted)
 if(remaining<0)throw new Error('Native receipt metadata exceeds bounds')
 // Round-robin across analyzers preserves a useful subset from each. Each analyzer
 // already sorts by severity. Counters remain unchanged, making truncation explicit.
 const maximum=Math.max(0,...value.checks.map(c=>c.findings?.length??0))
 for(let index=0;index<maximum;index++)for(let i=0;i<value.checks.length;i++){
  const finding=value.checks[i].findings?.[index]
  if(!finding)continue
  const cost=Buffer.byteLength(JSON.stringify(finding))+(fitted.checks[i].findings!.length?1:0)
  if(cost>remaining)continue
  fitted.checks[i].findings!.push(finding);remaining-=cost
 }
 return fitted
}
