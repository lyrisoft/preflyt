import { useEffect, useRef } from 'react'
import './engineering-figures.css'

type Point = [number, number, number]
const project = ([x, y, z]: Point) => [
  210 + (x - y) * 0.82,
  150 + (x + y) * 0.4 - z,
]
const line = (points: Point[], close = false) =>
  points
    .map((point, index) => `${index ? 'L' : 'M'}${project(point).join(' ')}`)
    .join(' ') + (close ? ' Z' : '')

function WirePath({
  d,
  accent = false,
  faint = false,
}: {
  d: string
  accent?: boolean
  faint?: boolean
}) {
  return (
    <path
      d={d}
      pathLength='1'
      className={[
        'engineering-path',
        accent && 'engineering-accent',
        faint && 'engineering-faint',
      ]
        .filter(Boolean)
        .join(' ')}
    />
  )
}

function RevisionStack() {
  return (
    <svg
      className='engineering-figure-art'
      viewBox='0 0 420 300'
      fill='none'
      aria-hidden='true'
      focusable='false'
    >
      {[44, 14, -16, -46].map((height, index) => (
        <g className='engineering-layer' data-layer={3 - index} key={height}>
          <WirePath
            d={line(
              [
                [-92, -70, height],
                [92, -70, height],
                [92, 70, height],
                [-92, 70, height],
              ],
              true
            )}
          />
          <WirePath
            d={line([
              [-92, 70, height],
              [-92, 70, height - 10],
              [92, 70, height - 10],
              [92, -70, height - 10],
              [92, -70, height],
            ])}
          />
          <WirePath
            d={line([
              [92, 70, height],
              [92, 70, height - 10],
            ])}
          />
          {[-64, -32, 0, 32, 64].map((x) => (
            <WirePath
              key={x}
              faint
              d={line([
                [x, -56, height],
                [x, 56, height],
              ])}
            />
          ))}
          {[-42, -14, 14, 42].map((y) => (
            <WirePath
              key={y}
              faint
              d={line([
                [-78, y, height],
                [78, y, height],
              ])}
            />
          ))}
          {index === 0 && (
            <>
              <WirePath
                accent
                d={line([
                  [-42, -14, height],
                  [10, -14, height],
                  [10, 32, height],
                  [54, 32, height],
                ])}
              />
              {[
                [-42, -14],
                [10, 32],
                [54, 32],
              ].map(([x, y]) => {
                const [cx, cy] = project([x, y, height])
                return (
                  <ellipse
                    key={`${x}-${y}`}
                    className='engineering-accent'
                    cx={cx}
                    cy={cy}
                    rx='3.5'
                    ry='2'
                  />
                )
              })}
            </>
          )}
        </g>
      ))}
      <g className='engineering-layer' data-layer='3'>
        <WirePath
          faint
          d={line([
            [-92, 70, 52],
            [-92, 70, -67],
          ])}
        />
        <WirePath
          faint
          d={line([
            [92, -70, 52],
            [92, -70, -67],
          ])}
        />
        <WirePath
          faint
          d={line([
            [92, 70, 52],
            [92, 70, -67],
          ])}
        />
        <WirePath d='M187 267h47M201 281h19' faint />
      </g>
    </svg>
  )
}

function Module({
  x,
  y,
  width,
  depth,
  height,
  layer,
}: {
  x: number
  y: number
  width: number
  depth: number
  height: number
  layer: number
}) {
  return (
    <g className='engineering-layer' data-layer={layer}>
      <WirePath
        d={line(
          [
            [x, y, height],
            [x + width, y, height],
            [x + width, y + depth, height],
            [x, y + depth, height],
          ],
          true
        )}
      />
      <WirePath
        d={line([
          [x, y + depth, height],
          [x, y + depth, 0],
          [x + width, y + depth, 0],
          [x + width, y, 0],
          [x + width, y, height],
        ])}
      />
      <WirePath
        d={line([
          [x + width, y + depth, height],
          [x + width, y + depth, 0],
        ])}
      />
      {[0.2, 0.4, 0.6, 0.8].map((fraction) => (
        <WirePath
          key={fraction}
          faint
          d={line([
            [x + width * fraction, y + depth, height],
            [x + width * fraction, y + depth, 0],
          ])}
        />
      ))}
      {[0.25, 0.5, 0.75].map((fraction) => (
        <WirePath
          key={fraction}
          faint
          d={line([
            [x, y + depth, height * fraction],
            [x + width, y + depth, height * fraction],
          ])}
        />
      ))}
      {[0.25, 0.5, 0.75].map((fraction) => (
        <WirePath
          key={fraction}
          faint
          d={line([
            [x + width, y + depth * fraction, 0],
            [x + width, y + depth * fraction, height],
          ])}
        />
      ))}
      <WirePath
        d={line(
          [
            [x + width * 0.2, y + depth * 0.25, height],
            [x + width * 0.8, y + depth * 0.25, height],
            [x + width * 0.8, y + depth * 0.75, height],
            [x + width * 0.2, y + depth * 0.75, height],
          ],
          true
        )}
        faint
      />
    </g>
  )
}

function EvidenceModules() {
  return (
    <svg
      className='engineering-figure-art'
      viewBox='0 0 420 300'
      fill='none'
      aria-hidden='true'
      focusable='false'
    >
      <g className='engineering-layer' data-layer='0'>
        <WirePath
          faint
          d={line(
            [
              [-116, -86, -28],
              [116, -86, -28],
              [116, 118, -28],
              [-116, 118, -28],
            ],
            true
          )}
        />
        <WirePath
          faint
          d={line(
            [
              [-106, -76, -28],
              [106, -76, -28],
              [106, 108, -28],
              [-106, 108, -28],
            ],
            true
          )}
        />
        {[-70, -20, 30, 80].map((x) => (
          <WirePath
            key={x}
            faint
            d={line([
              [x, -76, -28],
              [x, 108, -28],
            ])}
          />
        ))}
      </g>
      <Module x={-100} y={-28} width={64} depth={52} height={52} layer={1} />
      <Module x={36} y={-84} width={60} depth={46} height={44} layer={2} />
      <Module x={-4} y={62} width={78} depth={50} height={62} layer={3} />
      <g className='engineering-layer' data-layer='3'>
        <WirePath
          accent
          d={line([
            [-36, -2, 30],
            [0, -2, 30],
            [0, -62, 30],
            [36, -62, 30],
          ])}
        />
        <WirePath
          d={line([
            [60, -38, 22],
            [60, 28, 22],
            [34, 28, 22],
            [34, 62, 22],
          ])}
        />
        <WirePath
          faint
          d={line([
            [-68, 24, 14],
            [-68, 48, 14],
            [-24, 48, 14],
            [-24, 88, 14],
            [-4, 88, 14],
          ])}
        />
        {[
          [0, -2, 30],
          [0, -62, 30],
          [60, 28, 22],
          [34, 28, 22],
        ].map((point, index) => {
          const [cx, cy] = project(point as Point)
          return <ellipse key={index} cx={cx} cy={cy} rx='3' ry='2' />
        })}
      </g>
    </svg>
  )
}

function ReviewPlanes() {
  return (
    <svg
      className='engineering-figure-art'
      viewBox='0 0 420 300'
      fill='none'
      aria-hidden='true'
      focusable='false'
    >
      <g className='engineering-layer' data-layer='0'>
        <WirePath d='M58 227 203 272 372 218 227 173Z' faint />
        <WirePath d='M58 227v9l145 45 169-54v-9M203 272v9' faint />
        <WirePath
          d='M91 231 227 188 338 221M127 243 263 199M164 254 300 210'
          faint
        />
      </g>
      <g className='engineering-layer' data-layer='1'>
        <WirePath d='M128 38 326 97v125l-198-59Z' />
        <WirePath
          d='M144 64 310 114M144 86 273 125M144 108 286 151M144 130 236 158'
          faint
        />
        <WirePath d='M326 97l7-3v125l-7 3M128 38l7-3 198 59' faint />
      </g>
      <g className='engineering-layer' data-layer='2'>
        <WirePath d='M93 73 291 132v125L93 198Z' />
        <WirePath d='M93 73l7-3 198 59v125l-7 3M291 132l7-3' faint />
        <WirePath d='M93 98 291 157' />
        {[0, 1, 2].map((row) => (
          <g key={row}>
            <WirePath d={`M112 ${118 + row * 30}l10 3v10l-10-3Z`} />
            <WirePath
              d={`M137 ${127 + row * 30}l130 39M137 ${135 + row * 30}l87 26`}
              faint
            />
          </g>
        ))}
      </g>
      <g className='engineering-layer' data-layer='3'>
        <WirePath d='M64 67v165' />
        <WirePath d='M64 109c0 24 27 24 27 48v23c0 24-27 24-27 48' faint />
        <circle cx='64' cy='86' r='5' />
        <circle cx='64' cy='109' r='5' />
        <circle cx='91' cy='157' r='5' />
        <circle cx='64' cy='228' r='5' />
        <WirePath accent d='M69 228h18l35-12 40 12' />
        <WirePath d='M291 202l54-17v-68M326 130l19-6' faint />
        <ellipse
          className='engineering-accent'
          cx='162'
          cy='228'
          rx='3'
          ry='2'
        />
        <circle cx='345' cy='117' r='4' />
      </g>
    </svg>
  )
}

/** Original, decorative figures. Evidence and enforcement remain separate. */
export function EngineeringFigures() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const root = ref.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!root || reduced.matches || typeof IntersectionObserver === 'undefined')
      return
    const figures = root.querySelectorAll<HTMLElement>('.engineering-figure')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          ;(entry.target as HTMLElement).dataset.entered = 'true'
          observer.unobserve(entry.target)
        })
      },
      { threshold: 0.2 }
    )
    figures.forEach((figure) => observer.observe(figure))
    const stop = () => {
      if (!reduced.matches) return
      observer.disconnect()
      figures.forEach((figure) => {
        figure.removeAttribute('data-entered')
      })
    }
    reduced.addEventListener('change', stop)
    return () => {
      observer.disconnect()
      reduced.removeEventListener('change', stop)
    }
  }, [])

  return (
    <section
      ref={ref}
      className='engineering-figures container'
      aria-label='Engineering evidence in Preflyt'
    >
      <h2 className='engineering-intro'>
        <span>
          Preflyt connects your repository health, engineering standards and CI
          results.
        </span>{' '}
        Your team follows the evidence at the commit under review.
      </h2>
      <div className='engineering-figure-grid'>
        <figure className='engineering-figure'>
          <RevisionStack />
          <figcaption>
            <h3>Repository health</h3>
            <p>
              Understand supported findings and their analysis limits at the
              assessed revision.
            </p>
          </figcaption>
        </figure>
        <figure className='engineering-figure'>
          <EvidenceModules />
          <figcaption>
            <h3>Revision-bound evidence</h3>
            <p>
              Connect versioned requirements to CI results recorded for the same
              commit.
            </p>
          </figcaption>
        </figure>
        <figure className='engineering-figure'>
          <ReviewPlanes />
          <figcaption>
            <h3>Clear merge review</h3>
            <p>
              See passed, failed and missing checks. GitHub applies the
              configured merge rules.
            </p>
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
