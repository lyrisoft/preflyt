/** Immutable public Action release. Keep legacy workflows readable during migration. */
export const policyAction = "lyrisoft/preflyt-action@ccc826017dd0a02c5f5e6dfb0052ef2f8e482dfe";
export function isPolicyAction(value: unknown): boolean {
  return typeof value === "string" && (
    value === "./.github/actions/preflyt-policy" ||
    /^lyrisoft\/preflyt-action@(?:[a-f0-9]{40}|v\d+\.\d+\.\d+)$/.test(value)
  );
}
