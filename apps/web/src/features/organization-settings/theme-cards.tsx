import * as RadioGroup from '@radix-ui/react-radio-group'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { IconThemeDark } from '@/assets/custom/icon-theme-dark'
import { IconThemeLight } from '@/assets/custom/icon-theme-light'
import { IconThemeSystem } from '@/assets/custom/icon-theme-system'
import { useTheme } from '@/context/theme-provider'
import { SurfaceIcon } from '@/components/surface-icon'

const choices = [
  {
    value: 'system',
    title: 'System',
    description: 'Match your device settings',
    icon: Monitor,
    preview: IconThemeSystem,
  },
  {
    value: 'light',
    title: 'Light',
    description: 'A bright, clear workspace',
    icon: Sun,
    preview: IconThemeLight,
  },
  {
    value: 'dark',
    title: 'Dark',
    description: 'A softer view in low light',
    icon: Moon,
    preview: IconThemeDark,
  },
] as const

export function ThemeCards() {
  const { theme, setTheme } = useTheme()
  return (
    <div className='space-y-4'>
      <div>
        <h3 id='theme-label' className='text-sm font-semibold'>
          Theme
        </h3>
        <p className='mt-1 text-sm text-muted-foreground'>
          Choose how Preflyt looks in this browser.
        </p>
      </div>
      <RadioGroup.Root
        aria-labelledby='theme-label'
        value={theme}
        onValueChange={(value) => setTheme(value as typeof theme)}
        className='grid grid-cols-1 gap-4 sm:grid-cols-3'
      >
        {choices.map(
          ({ value, title, description, icon, preview: Preview }) => (
            <RadioGroup.Item
              key={value}
              value={value}
              aria-label={title}
              aria-describedby={`theme-${value}-description`}
              className='group relative min-w-0 cursor-pointer rounded-xl border bg-card p-4 text-start shadow-xs transition-[border-color,box-shadow] duration-150 outline-none hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=checked]:border-primary data-[state=checked]:bg-primary/5 data-[state=checked]:ring-1 data-[state=checked]:ring-primary'
            >
              <span className='flex items-center justify-between'>
                <SurfaceIcon icon={icon} tone='violet' />
                <span
                  aria-hidden='true'
                  className='flex size-5 items-center justify-center rounded-full border border-input group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary group-data-[state=checked]:text-primary-foreground'
                >
                  <RadioGroup.Indicator>
                    <Check className='size-3.5' />
                  </RadioGroup.Indicator>
                </span>
              </span>
              <span
                aria-hidden='true'
                className='my-4 flex h-24 items-center justify-center rounded-lg border bg-muted/20 p-3'
              >
                <Preview className='h-full w-full max-w-36' />
              </span>
              <span className='block text-sm font-semibold'>{title}</span>
              <span
                id={`theme-${value}-description`}
                className='mt-1 block text-xs leading-5 text-muted-foreground'
              >
                {description}
              </span>
            </RadioGroup.Item>
          )
        )}
      </RadioGroup.Root>
    </div>
  )
}
