import { HealthScannerClient } from './health-scanner-client.js'

try {
  await new HealthScannerClient().package('scanner-readiness')
} catch {
  process.exitCode = 1
}
