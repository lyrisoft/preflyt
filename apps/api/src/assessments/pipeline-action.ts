/** Immutable public Action release. Keep legacy workflows readable during migration. */
export const policyAction = "lyrisoft/preflyt-action@d80243bae90cc85eaaca08a60e8efd15a413d35a";
export function isPolicyAction(value: unknown): boolean {
  return typeof value === "string" && (
    value === "./.github/actions/preflyt-policy" ||
    /^lyrisoft\/preflyt-action@(?:[a-f0-9]{40}|v\d+\.\d+\.\d+)$/.test(value)
  );
}
