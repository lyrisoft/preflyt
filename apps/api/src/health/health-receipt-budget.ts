import type {NativeReceipt} from '../execution/native-receipt.js'
const bytes=(value:NativeReceipt)=>Buffer.from(JSON.stringify(value)).toString('base64url').length
const ranks:Record<string,number>={unknown:0,low:1,medium:2,high:3,critical:4}
/** Preserve signed scope, outcomes, measured counters and cleanup; reduce only retained details. */
export function fitHealthReceipt(value:NativeReceipt):NativeReceipt {
 if(!value.selectionId.startsWith('health:')||bytes(value)<=40000)return value
 const fitted={...value,checks:value.checks.map(check=>({...check,...(check.findings?{findings:[...check.findings]}:{})}))}
 while(bytes(fitted)>40000) {
  const multiple=fitted.checks.filter(check=>(check.findings?.length??0)>1)
  const candidates=multiple.length?multiple:fitted.checks.filter(check=>check.findings?.length)
  if(!candidates.length)throw new Error('Native receipt metadata exceeds bounds')
  candidates.sort((a,b)=>ranks[a.findings!.at(-1)!.severity]-ranks[b.findings!.at(-1)!.severity]||Buffer.byteLength(JSON.stringify(b.findings))-Buffer.byteLength(JSON.stringify(a.findings)))
  candidates[0].findings!.pop()
 }
 return fitted
}
