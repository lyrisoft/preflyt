export type ControlInput = { required: boolean; configuration: string }
export function controlSummary(controls: ControlInput[]) {
  const states = ['HINT_DETECTED', 'UNKNOWN', 'MISSING'] as const
  const state = (control: ControlInput) =>
    states.includes(control.configuration as (typeof states)[number])
      ? control.configuration
      : 'UNKNOWN'
  return {
    distribution: states.map((key) => ({
      key,
      value: controls.filter((control) => state(control) === key).length,
    })),
    requirements: [true, false].map((required) => ({
      name: required ? 'Required' : 'Advisory',
      found: controls.filter(
        (c) => c.required === required && state(c) === 'HINT_DETECTED'
      ).length,
      unknown: controls.filter(
        (c) => c.required === required && state(c) === 'UNKNOWN'
      ).length,
      missing: controls.filter(
        (c) => c.required === required && state(c) === 'MISSING'
      ).length,
    })),
  }
}
