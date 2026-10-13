/** Immutable public Action release. Keep legacy workflows readable during migration. */
export const policyAction = "lyrisoft/preflyt-action@adfe42ef61cf25936d777e6115b224293cd4675f";
export function isPolicyAction(value: unknown): boolean {
  return typeof value === "string" && (
    value === "./.github/actions/preflyt-policy" ||
    /^lyrisoft\/preflyt-action@(?:[a-f0-9]{40}|v\d+\.\d+\.\d+)$/.test(value)
  );
}
