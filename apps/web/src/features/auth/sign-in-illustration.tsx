import { useId } from 'react'
import { siGithub, siGithubactions } from 'simple-icons'

const trunk = 'M152 76V780'
const branch = 'M152 220c0 64 112 64 112 128v152c0 64-112 64-112 128'
const merge = 'M264 392c0 48 88 48 88 96v112'

// Microsoft Azure Pipelines silhouette, adapted to monochrome.
// https://github.com/microsoft/azure-pipelines-vscode/blob/main/assets/pipelines-file-icon.svg
// Copyright Microsoft Corporation; MIT license in assets/azure-pipelines.LICENSE.txt.
const azurePipelinesSilhouette =
  'M5.83331 26.8398L7.84607 24.6875L10.3467 27.1885L8.31329 29.2217L10.7775 31.6865L12.8111 29.6523L15.3291 32.1709L13.3333 34.167L19.1667 40H28.3333C29.2538 40 30 39.2539 30 38.333V25L38.5175 19.3232C39.4437 18.7051 40 17.6641 40 16.5508V1.66699C40 0.746094 39.2538 0 38.3333 0H23.4492C22.3354 0 21.2953 0.556641 20.6769 1.48242L15 10H1.66669C0.746216 10 0 10.7461 0 11.667V20.833L5.83331 26.8398Z M30 15.0001C32.76142 15.0001 34.99999 12.76146 34.99999 10.00003C34.99999 7.23859 32.76142 5 30 5C27.23857 5 25 7.23859 25 10.00003C25 12.76146 27.23857 15.0001 30 15.0001Z'

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
        <circle cx='152' cy='128' r='14' />
        <circle cx='152' cy='220' r='14' />
        <circle cx='152' cy='384' r='14' />
        <circle cx='152' cy='552' r='14' />
        <circle cx='152' cy='680' r='14' />
        <circle cx='264' cy='348' r='14' />
        <circle cx='264' cy='500' r='14' />
        <circle cx='352' cy='568' r='14' />
      </g>
      <g className='sign-in-float' data-ambient='true'>
        <circle cx='264' cy='348' r='22' />
        <circle cx='152' cy='680' r='22' />
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
        <path d='M1070 380 1016 432Q1003 444 1016 456L1070 508' />
        <path d='m1224 380 54 52q13 12 0 24l-54 52' />
        <path d='M1172 350c-13 38-23 76-35 115s-12 37-17 53' />
      </g>

      <g
        className='sign-in-provider-icons'
        fill='currentColor'
        aria-hidden='true'
      >
        <svg
          x='384'
          y='144'
          width='64'
          height='64'
          viewBox='0 0 24 24'
          data-provider='github'
          focusable='false'
        >
          <path d={siGithub.path} />
        </svg>
        <svg
          x='992'
          y='704'
          width='72'
          height='72'
          viewBox='0 0 24 24'
          data-provider='github-actions'
          focusable='false'
        >
          <path d={siGithubactions.path} />
        </svg>
        <svg
          x='368'
          y='720'
          width='64'
          height='64'
          viewBox='0 0 40 40'
          data-provider='azure-pipelines'
          focusable='false'
        >
          <path d={azurePipelinesSilhouette} fillRule='evenodd' />
          <path d='M3 30H0V40H10V37H3V30Z' />
        </svg>
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
          width='96'
          height='96'
          patternUnits='userSpaceOnUse'
        >
          <path d='M96 0H0v96' />
        </pattern>
      </defs>
      <rect width='100%' height='100%' fill={`url(#${gridId})`} />
    </svg>
  )
}
