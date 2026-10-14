// Only fixed reason codes leave the installer. Package-manager output may contain
// sensitive dependency names or URLs and must never be copied into reports.
export function dependencyFailure(output, timedOut = false) {
  if (timedOut) return "DEPENDENCY_INSTALL_TIMED_OUT";
  if (
    /npm ci.*(?:in sync|sync)/s.test(output) ||
    /ERR_PNPM_OUTDATED_LOCKFILE|Your lockfile needs to be updated/.test(output)
  ) return "LOCKFILE_OUT_OF_SYNC";
  return "DEPENDENCY_INSTALL_FAILED";
}
