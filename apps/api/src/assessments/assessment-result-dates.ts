import { previewGate } from './gate-preview.js'

/** Presentation metadata, added after evaluation so historical gate hashes are unchanged. */
export function datedGatePreview(snapshot: Parameters<typeof previewGate>[0]) {
  const preview = previewGate(snapshot)
  const report = snapshot.report as { observations?: { deliveryId: string; observedAt?: string }[] }
  const observations = Array.isArray(report?.observations) ? report.observations : []
  return {
    ...preview,
    rules: preview.rules.map((rule: ReturnType<typeof previewGate>['rules'][number]) => {
      const matches = rule.deliveryId ? observations.filter(item => item?.deliveryId === rule.deliveryId) : []
      const value = matches.length === 1 ? matches[0].observedAt : null
      return { ...rule, recordedAt: typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null }
    }),
  }
}
