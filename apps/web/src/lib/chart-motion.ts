/** Recharts auto mode tracks reduced motion and disables animation during SSR. */
export const chartAnimation = {
  isAnimationActive: 'auto',
  animationBegin: 0,
  animationDuration: 280,
  animationEasing: 'cubic-bezier(0.16,1,0.3,1)',
} as const

export const chartTooltipAnimation = {
  isAnimationActive: 'auto',
  animationDuration: 150,
  animationEasing: 'cubic-bezier(0.16,1,0.3,1)',
} as const
