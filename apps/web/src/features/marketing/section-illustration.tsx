import { siGithub, siGithubactions } from 'simple-icons'
import './section-illustration.css'

export type SectionIllustrationVariant =
  'hero' | 'health' | 'evidence' | 'protection' | 'hosting' | 'process'

type Provider = {
  kind: 'github' | 'github-actions' | 'azure-pipelines'
  x: number
  y: number
  size: number
}
type Geometry = {
  branches: string[]
  points: [number, number][]
  bands: string[]
  glyphs: [number, number, number][]
  providers: Provider[]
  crosshairs: [number, number][]
}

// Microsoft Azure Pipelines silhouette, matching the sign-in illustration.
// https://github.com/microsoft/azure-pipelines-vscode/blob/main/assets/pipelines-file-icon.svg
// Copyright Microsoft Corporation; MIT license in assets/azure-pipelines.LICENSE.txt.
const azurePipelinesSilhouette =
  'M5.83331 26.8398L7.84607 24.6875L10.3467 27.1885L8.31329 29.2217L10.7775 31.6865L12.8111 29.6523L15.3291 32.1709L13.3333 34.167L19.1667 40H28.3333C29.2538 40 30 39.2539 30 38.333V25L38.5175 19.3232C39.4437 18.7051 40 17.6641 40 16.5508V1.66699C40 0.746094 39.2538 0 38.3333 0H23.4492C22.3354 0 21.2953 0.556641 20.6769 1.48242L15 10H1.66669C0.746216 10 0 10.7461 0 11.667V20.833L5.83331 26.8398Z M30 15.0001C32.76142 15.0001 34.99999 12.76146 34.99999 10.00003C34.99999 7.23859 32.76142 5 30 5C27.23857 5 25 7.23859 25 10.00003C25 12.76146 27.23857 15.0001 30 15.0001Z'

const geometry: Record<SectionIllustrationVariant, Geometry> = {
  hero: {
    branches: [
      'M58 34V866',
      'M58 168c0 76 100 76 100 152v168c0 76-100 76-100 152',
      'M158 400c0 56 70 56 70 112v118',
      'M58 712c0 52 72 52 72 104v48',
    ],
    points: [
      [58, 108],
      [58, 168],
      [58, 428],
      [58, 640],
      [58, 712],
      [158, 320],
      [158, 488],
      [228, 588],
    ],
    bands: [
      'M1180 190h42m22 0h102m22 0h38',
      'M1204 228h80m22 0h106',
      'M1204 266h120m22 0h64',
      'M1228 304h42m22 0h86',
      'M1180 342h42',
    ],
    glyphs: [[1202, 480, 1.45]],
    providers: [
      { kind: 'github', x: 1240, y: 96, size: 62 },
      { kind: 'github-actions', x: 1310, y: 762, size: 60 },
    ],
    crosshairs: [
      [278, 170],
      [1224, 414],
      [58, 794],
    ],
  },
  health: {
    branches: [
      'M1346 42V852',
      'M1346 226c0 78-142 78-142 156v116c0 78 142 78 142 156',
      'M1204 436c0 64-112 64-112 128v146',
    ],
    points: [
      [1346, 126],
      [1346, 226],
      [1346, 654],
      [1204, 382],
      [1204, 498],
      [1092, 644],
    ],
    bands: [
      'M54 660h52m24 0h162m24 0h58',
      'M86 697h136m24 0h118',
      'M86 734h70m24 0h168',
      'M54 771h52',
    ],
    glyphs: [[86, 128, 1.8]],
    providers: [
      { kind: 'github', x: 1060, y: 106, size: 62 },
      { kind: 'azure-pipelines', x: 490, y: 724, size: 68 },
    ],
    crosshairs: [
      [72, 470],
      [912, 790],
    ],
  },
  evidence: {
    branches: [
      'M122 38V852',
      'M122 186c0 80 146 80 146 160v174c0 80-146 80-146 160',
      'M268 416c0 58 114 58 114 116v164',
    ],
    points: [
      [122, 106],
      [122, 186],
      [122, 680],
      [268, 346],
      [268, 520],
      [382, 616],
    ],
    bands: [
      'M1020 164h56m24 0h170m24 0h50',
      'M1052 201h112m24 0h176',
      'M1052 238h176m24 0h70',
      'M1084 275h58m24 0h128',
      'M1020 312h56',
    ],
    glyphs: [[1080, 564, 1.9]],
    providers: [
      { kind: 'github-actions', x: 534, y: 94, size: 80 },
      { kind: 'github', x: 882, y: 748, size: 64 },
    ],
    crosshairs: [
      [422, 794],
      [1230, 424],
    ],
  },
  protection: {
    branches: [
      'M1300 36V862',
      'M1300 166c0 94-164 94-164 188v162c0 94 164 94 164 188',
      'M1136 442c0 70-108 70-108 140v136',
    ],
    points: [
      [1300, 100],
      [1300, 166],
      [1300, 704],
      [1136, 354],
      [1136, 516],
      [1028, 640],
    ],
    bands: [
      'M42 154h56m24 0h136m24 0h64',
      'M74 191h156m24 0h118',
      'M74 228h62m24 0h182',
      'M42 265h56',
    ],
    glyphs: [[80, 568, 1.8]],
    providers: [
      { kind: 'github', x: 990, y: 92, size: 82 },
      { kind: 'github-actions', x: 464, y: 738, size: 66 },
    ],
    crosshairs: [
      [654, 126],
      [1230, 804],
    ],
  },
  hosting: {
    branches: [
      'M82 768H1358',
      'M278 768c88 0 88-138 176-138h198c88 0 88 138 176 138',
      'M652 630c62 0 62-112 124-112h186',
    ],
    points: [
      [160, 768],
      [278, 768],
      [454, 630],
      [652, 630],
      [828, 768],
      [1162, 768],
    ],
    bands: [
      'M1014 98h48m24 0h156m24 0h56',
      'M1046 135h104m24 0h172',
      'M1046 172h174m24 0h48',
      'M1014 209h48',
    ],
    glyphs: [[54, 70, 1.6]],
    providers: [
      { kind: 'github', x: 1280, y: 324, size: 66 },
      { kind: 'azure-pipelines', x: 948, y: 652, size: 62 },
    ],
    crosshairs: [
      [72, 514],
      [866, 156],
      [1370, 808],
    ],
  },
  process: {
    branches: [
      'M44 670H1388',
      'M270 670c80 0 80-134 160-134h152c80 0 80 134 160 134',
      'M974 670c80 0 80-134 160-134h152',
    ],
    points: [
      [148, 670],
      [270, 670],
      [430, 536],
      [582, 536],
      [742, 670],
      [974, 670],
      [1134, 536],
    ],
    bands: [
      'M72 130h48m24 0h138m24 0h44',
      'M104 167h98m24 0h138',
      'M104 204h158m24 0h52',
      'M72 241h48',
    ],
    glyphs: [[1150, 114, 1.4]],
    providers: [
      { kind: 'github', x: 488, y: 118, size: 64 },
      { kind: 'github-actions', x: 846, y: 292, size: 70 },
    ],
    crosshairs: [
      [50, 448],
      [1320, 776],
      [742, 144],
    ],
  },
}

/** Decorative geometry adapted from sign-in, never source or assessment data.
 * Place inside a relative, isolated section with its content above this layer.
 */
export function SectionIllustration({
  variant,
  className = '',
}: {
  variant: SectionIllustrationVariant
  className?: string
}) {
  const art = geometry[variant]
  return (
    <svg
      className={`section-illustration ${className}`}
      data-variant={variant}
      viewBox='0 0 1440 900'
      preserveAspectRatio={
        variant === 'hero' ? 'xMidYMid meet' : 'xMidYMid slice'
      }
      fill='none'
      aria-hidden='true'
      focusable='false'
    >
      <g className='section-illustration__branches'>
        {art.branches.map((path) => (
          <path key={path} d={path} />
        ))}
      </g>
      <g className='section-illustration__signal'>
        {art.branches.map((path) => (
          <path key={path} d={path} pathLength='100' />
        ))}
      </g>
      <g className='section-illustration__points'>
        {art.points.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r='14' />
        ))}
      </g>
      <g className='section-illustration__bands'>
        {art.bands.map((path) => (
          <path key={path} d={path} />
        ))}
      </g>
      <g className='section-illustration__glyphs'>
        {art.glyphs.map(([x, y, scale]) => (
          <g
            key={`${x}-${y}`}
            transform={`translate(${x} ${y}) scale(${scale})`}
          >
            <path d='M32 28 8 51Q-4 62 8 73L32 96' />
            <path d='m116 28 24 23q12 11 0 22l-24 23' />
            <path d='M93 13 65 111' />
          </g>
        ))}
      </g>
      <g className='section-illustration__providers' fill='currentColor'>
        {art.providers.map(({ kind, x, y, size }) => (
          <svg
            key={kind}
            x={x}
            y={y}
            width={size}
            height={size}
            viewBox={kind === 'azure-pipelines' ? '0 0 40 40' : '0 0 24 24'}
            focusable='false'
          >
            <path
              d={
                kind === 'github'
                  ? siGithub.path
                  : kind === 'github-actions'
                    ? siGithubactions.path
                    : azurePipelinesSilhouette
              }
              fillRule='evenodd'
            />
            {kind === 'azure-pipelines' && <path d='M3 30H0V40H10V37H3V30Z' />}
          </svg>
        ))}
      </g>
      <g className='section-illustration__crosshairs'>
        {art.crosshairs.map(([x, y]) => (
          <path key={`${x}-${y}`} d={`M${x - 6} ${y}h12M${x} ${y - 6}v12`} />
        ))}
      </g>
    </svg>
  )
}
