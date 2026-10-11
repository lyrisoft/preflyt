/** Immutable public Action release. Keep legacy workflows readable during migration. */
export const policyAction = "lyrisoft/preflyt-action@49019a3e7febf942b937628bc831818e4a1b295f";
export function isPolicyAction(value: unknown): boolean {
  return typeof value === "string" && (
    value === "./.github/actions/preflyt-policy" ||
    /^lyrisoft\/preflyt-action@(?:[a-f0-9]{40}|v\d+\.\d+\.\d+)$/.test(value)
  );
}
