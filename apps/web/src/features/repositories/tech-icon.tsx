import {
  siAngular,
  siC,
  siCplusplus,
  siDotnet,
  siExpress,
  siFastify,
  siGo,
  siJavascript,
  siKotlin,
  siNestjs,
  siNextdotjs,
  siNuxt,
  siOpenjdk,
  siPhp,
  siPython,
  siReact,
  siRuby,
  siRust,
  siSvelte,
  siSwift,
  siTypescript,
  siVuedotjs,
  type SimpleIcon,
} from 'simple-icons'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/** Names as reported by repository discovery. */
const icons: Record<string, SimpleIcon> = {
  TypeScript: siTypescript,
  JavaScript: siJavascript,
  Python: siPython,
  Go: siGo,
  Rust: siRust,
  Java: siOpenjdk,
  Kotlin: siKotlin,
  Ruby: siRuby,
  PHP: siPhp,
  'C#': siDotnet,
  C: siC,
  'C++': siCplusplus,
  Swift: siSwift,
  React: siReact,
  'Next.js': siNextdotjs,
  NestJS: siNestjs,
  Express: siExpress,
  Fastify: siFastify,
  Vue: siVuedotjs,
  Nuxt: siNuxt,
  Angular: siAngular,
  Svelte: siSvelte,
}

/** Near-black brand marks would vanish in dark mode; they follow the text color. */
function isNearBlack(hex: string) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 40
}

export function TechIcon({ name }: { name: string }) {
  const icon = icons[name]
  const brand = icon && !isNearBlack(icon.hex) ? `#${icon.hex}` : undefined
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role='img'
          aria-label={name}
          className='inline-flex size-9 items-center justify-center rounded-lg border bg-muted/40'
          style={
            brand
              ? { backgroundColor: `${brand}14`, borderColor: `${brand}33` }
              : undefined
          }
        >
          {icon ? (
            <svg
              viewBox='0 0 24 24'
              aria-hidden='true'
              className='size-[18px]'
              fill={brand ?? 'currentColor'}
            >
              <path d={icon.path} />
            </svg>
          ) : (
            <span className='text-[11px] font-semibold'>
              {name.slice(0, 2)}
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  )
}
