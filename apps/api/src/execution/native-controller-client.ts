import { nativeRuntimeApproval } from './native-runtime.js'
import type { NativeReceiptExpected } from './native-receipt.js'
import type { NativeSourceBundle } from './native-source.js'
/** Worker has HTTP access only; it never imports runtime-control code or receives scanner credentials. */
export async function nativeControllerCall(
  action: 'admit' | 'status' | 'cancel',
  expected: NativeReceiptExpected,
  source?: NativeSourceBundle,
  signal?: AbortSignal,
): Promise<{ state: string; signature?: string }> {
  const reviewed = nativeRuntimeApproval(),
    key = process.env.NATIVE_CONTROLLER_API_KEY ?? ''
  if (
    !reviewed ||
    reviewed.approvalHash !== expected.approvalHash ||
    key.length < 32 ||
    key.length > 256
  )
    throw new Error('Native controller connection unavailable')
  const response = await fetch(
    reviewed.approval.controllerOrigin + '/jobs/' + action,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expected, ...(source ? { source } : {}) }),
      redirect: 'error',
      signal: AbortSignal.any([
        AbortSignal.timeout(30000),
        ...(signal ? [signal] : []),
      ]),
    },
  )
  if (!response.ok || !response.body)
    throw new Error('Native controller unavailable')
  let bytes = 0
  const chunks: Buffer[] = []
  for await (const chunk of response.body as any) {
    bytes += chunk.length
    if (bytes > 50000)
      throw new Error('Native controller response exceeds bounds')
    chunks.push(Buffer.from(chunk))
  }
  const value = JSON.parse(Buffer.concat(chunks).toString())
  if (
    !value ||
    !['PREPARING', 'RUNNING', 'COMPLETE'].includes(value.state) ||
    (value.signature !== undefined &&
      (typeof value.signature !== 'string' || value.signature.length > 41000))
  )
    throw new Error('Invalid native controller response')
  if (nativeRuntimeApproval()?.approvalHash !== reviewed.approvalHash)
    throw new Error('Native review changed')
  return value
}
