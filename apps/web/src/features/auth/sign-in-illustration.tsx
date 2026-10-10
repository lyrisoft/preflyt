import { useId } from 'react'

const trunk = 'M152 76V780'
const branch = 'M152 220c0 64 112 64 112 128v152c0 64-112 64-112 128'
const merge = 'M264 392c0 48 88 48 88 96v112'

/** Abstract source and commit geometry; no live code or assessment outcomes. */
export function SignInIllustration() {
  return (
    <svg
      className='sign-in-illustration'
      viewBox='0 0 1440 900'
      preserveAspectRatio='xMidYMid slice'
      fill='none'
      aria-hidden='true'
      focusable='false'
    >
      <g className='sign-in-commit-lines'>
        <path d={trunk} />
        <path d={branch} />
        <path d={merge} />
        <path d='M152 680c0 48 72 48 72 96v48' />
      </g>
      <g className='sign-in-signal' data-ambient='true'>
        <path d={trunk} pathLength='100' />
        <path d={branch} pathLength='100' />
        <path d={merge} pathLength='100' />
      </g>
      <g className='sign-in-commit-points'>
        <circle cx='152' cy='128' r='7' />
        <circle cx='152' cy='220' r='7' />
        <circle cx='152' cy='384' r='7' />
        <circle cx='152' cy='552' r='7' />
        <circle cx='152' cy='680' r='7' />
        <circle cx='264' cy='348' r='7' />
        <circle cx='264' cy='500' r='7' />
        <circle cx='352' cy='568' r='7' />
      </g>
      <g className='sign-in-float' data-ambient='true'>
        <circle cx='264' cy='348' r='15' />
        <circle cx='152' cy='680' r='15' />
      </g>
      <g className='sign-in-technical-labels'>
        <text x='176' y='133'>
          code
        </text>
        <text x='288' y='353'>
          review
        </text>
        <text x='176' y='685'>
          merge
        </text>
      </g>

      <g className='sign-in-source-lines'>
        <path d='M1040 148h38m18 0h108m18 0h36' />
        <path d='M1064 176h74m18 0h164' />
        <path d='M1064 204h148m18 0h48' />
        <path d='M1088 232h44m18 0h112' />
        <path d='M1064 260h88m18 0h140' />
        <path d='M1040 288h38' />
        <path d='M1136 652h38m18 0h120' />
        <path d='M1160 680h84m18 0h66' />
        <path d='M1160 708h136' />
        <path d='M1136 736h38' />
      </g>
      <g className='sign-in-code-brackets'>
        <path d='m1070 380-66 64 66 64m154-128 66 64-66 64m-56-166-48 206' />
      </g>
      <g className='sign-in-crosshairs'>
        <path d='M332 148h12m-6-6v12M1018 592h12m-6-6v12M1248 820h12m-6-6v12M64 812h12m-6-6v12' />
      </g>
    </svg>
  )
}

export function SignInBackground() {
  const gridId = useId()
  return (
    <svg
      className='sign-in-background'
      width='100%'
      height='100%'
      fill='none'
      aria-hidden='true'
      focusable='false'
    >
      <defs>
        <pattern
          id={gridId}
          width='64'
          height='64'
          patternUnits='userSpaceOnUse'
        >
          <path d='M64 0H0v64' />
          <path d='M32 30v4m-2-2h4' />
        </pattern>
      </defs>
      <rect width='100%' height='100%' fill={`url(#${gridId})`} />
    </svg>
  )
}
