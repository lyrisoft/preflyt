/** Bounded static Health output; CI imports keep their smaller existing limits. */
export const HEALTH_REPORT_BYTES = 8 * 1024 * 1024
export const HEALTH_REPORT_BASE64 = Math.ceil(HEALTH_REPORT_BYTES / 3) * 4
export const HEALTH_RECEIPT_PAYLOAD = 8 * 1024 * 1024
export const HEALTH_FINDINGS_PER_CHECK = 5000
