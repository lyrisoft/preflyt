/** Immutable public Action release. Keep legacy workflows readable during migration. */
export const policyAction = "lyrisoft/preflyt-action@ffd33c5e44efb2f4d69d07aea3e471505046a05f";
export function isPolicyAction(value: unknown): boolean {
  return typeof value === "string" && (
    value === "./.github/actions/preflyt-policy" ||
    /^lyrisoft\/preflyt-action@(?:[a-f0-9]{40}|v\d+\.\d+\.\d+)$/.test(value)
  );
}
