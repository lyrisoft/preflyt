/** Exact public Action release version. Keep legacy workflows readable during migration. */
export const policyAction = "lyrisoft/preflyt-action@v2.1.1";
export function isPolicyAction(value: unknown): boolean {
  return typeof value === "string" && (
    value === "./.github/actions/preflyt-policy" ||
    /^lyrisoft\/preflyt-action@(?:[a-f0-9]{40}|v\d+\.\d+\.\d+)$/.test(value)
  );
}
