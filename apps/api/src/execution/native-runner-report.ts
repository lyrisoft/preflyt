/** Shared Docker/Kubernetes wrapper envelope; source identity and bounded canonical bytes are mandatory. */
export function nativeRunnerReport(
  output: Buffer,
  sourceHash: string,
  exitCode: number,
): Buffer | null {
  if (
    output.length > 360448 ||
    !/^[a-f0-9]{64}$/.test(sourceHash) ||
    !Number.isInteger(exitCode) ||
    exitCode < 0 ||
    exitCode > 255
  )
    throw new Error('Invalid runner report')
  const envelope = JSON.parse(output.toString('utf8'))
  if (
    Object.keys(envelope).sort().join(',') !==
      'exitCode,report,sourceHash,version' ||
    envelope.version !== 2 ||
    envelope.sourceHash !== sourceHash ||
    envelope.exitCode !== exitCode ||
    !(
      envelope.report === null ||
      (typeof envelope.report === 'string' &&
        envelope.report.length <= 349528 &&
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          envelope.report,
        ))
    )
  )
    throw new Error('Invalid runner report')
  const report =
    envelope.report === null ? null : Buffer.from(envelope.report, 'base64')
  if (
    report &&
    (report.length > 262144 || report.toString('base64') !== envelope.report)
  )
    throw new Error('Invalid report encoding')
  return report
}
