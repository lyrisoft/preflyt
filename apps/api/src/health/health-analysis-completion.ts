import type { NativeReceiptCheck } from '../execution/native-receipt.js'
import { fileAnalysisRules, validFileAnalysis } from './health-file-analysis.js'
import { validDuplicationMeasurement } from './health-measurements.js'

/** Health completion describes execution within the recorded analyzer scope,
 * not the stronger FULL_RULE guarantee consumed by native CI policy checks. */
export function healthAnalysisComplete(check: NativeReceiptCheck): boolean {
  if (
    !check.cleanupConfirmed ||
    !['PASS', 'FAIL'].includes(check.state) ||
    !check.findings ||
    !Number.isSafeInteger(check.summary?.results) ||
    check.summary?.results !== check.findings.length ||
    check.scanErrors?.length
  ) return false

  if (check.coverage === 'FULL_RULE') return true
  if (check.coverage !== 'PARTIAL') return false

  // Limited fixed-rule adapters need their verified report identity and actual
  // scope evidence. An arbitrary PARTIAL receipt is never enough on its own.
  if (
    !/^[a-f0-9]{64}$/.test(check.reportHash ?? '') ||
    !/^[a-f0-9]{64}$/.test(check.configHash ?? '') ||
    !check.toolVersion ||
    check.summary?.runs !== 1
  ) return false

  if (fileAnalysisRules.includes(check.ruleId)) {
    return validFileAnalysis(check.fileAnalysis) &&
      check.fileAnalysis.analyzedFiles > 0 && check.fileAnalysis.skippedFiles === 0
  }
  if (check.ruleId === 'quality.duplication') {
    return validDuplicationMeasurement(check.measurement) && check.measurement.analyzedLines > 0
  }
  return ['security.dependencies', 'iac.policy'].includes(check.ruleId)
}
