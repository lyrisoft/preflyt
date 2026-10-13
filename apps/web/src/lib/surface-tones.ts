export type SurfaceTone = 'blue' | 'teal' | 'violet' | 'amber'

/** Category accents identify sections; status outcomes use status-tones. */
export const surfaceTones: Record<SurfaceTone, string> = {
  blue: 'border-info/20 bg-info/10 text-info-text',
  teal: 'border-chart-2/20 bg-chart-2/10 text-chart-2',
  violet: 'border-chart-4/20 bg-chart-4/10 text-chart-4',
  amber: 'border-warning/20 bg-warning/10 text-warning-text',
}
