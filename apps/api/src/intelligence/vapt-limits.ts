/** Cumulative allowances for one source-only AI security scan, not a model context window. */
export const defaultVaptLimits = {
  maxInputTokens: 4_000_000,
  maxOutputTokens: 131_072,
  maxModelCalls: 80,
};
export const vaptLimitBounds = {
  maxInputTokens: { min: 100_000, max: 100_000_000 },
  maxOutputTokens: { min: 8192, max: 2_000_000 },
  maxModelCalls: { min: 1, max: 1000 },
};
export type VaptLimits = typeof defaultVaptLimits;
export function validVaptLimits(input: VaptLimits) {
  return (Object.keys(vaptLimitBounds) as (keyof VaptLimits)[]).every(
    (key) =>
      Number.isSafeInteger(input[key]) &&
      input[key] >= vaptLimitBounds[key].min &&
      input[key] <= vaptLimitBounds[key].max,
  );
}
