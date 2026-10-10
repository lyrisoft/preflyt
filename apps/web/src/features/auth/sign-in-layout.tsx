import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pause, Play, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SignInBackground, SignInIllustration } from './sign-in-illustration'
import './sign-in.css'

type SignInLayoutProps = {
  children: ReactNode
  footer?: ReactNode
}

/** Shared entry surface; organization onboarding keeps its separate AuthLayout. */
export function SignInLayout({ children, footer }: SignInLayoutProps) {
  const illustrationRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(() => !document.hidden)
  const [inView, setInView] = useState(true)

  useEffect(() => {
    const updateVisibility = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', updateVisibility)
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting)
    })
    if (illustrationRef.current) observer.observe(illustrationRef.current)
    return () => {
      document.removeEventListener('visibilitychange', updateVisibility)
      observer.disconnect()
    }
  }, [])

  return (
    <div
      className='preflyt-sign-in'
      data-motion-enabled={!paused && visible && inView}
    >
      <SignInBackground />
      <div ref={illustrationRef} className='sign-in-artwork'>
        <SignInIllustration />
      </div>

      <header className='sign-in-header'>
        <div className='sign-in-brand'>
          <div className='sign-in-brand-mark'>
            <ShieldCheck
              aria-hidden='true'
              className='size-5'
              strokeWidth={1.7}
            />
          </div>
          <span className='sign-in-wordmark'>Preflyt</span>
          <span className='sign-in-brand-divider' aria-hidden='true' />
          <span className='sign-in-brand-caption text-muted-foreground'>
            Engineering workspace
          </span>
        </div>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='sign-in-motion-control'
          aria-label={
            paused
              ? 'Resume background animation'
              : 'Pause background animation'
          }
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? (
            <Play aria-hidden='true' className='size-3.5' />
          ) : (
            <Pause aria-hidden='true' className='size-3.5' />
          )}
          {paused ? 'Resume animation' : 'Pause animation'}
        </Button>
      </header>

      <main className='sign-in-main'>
        <section className='sign-in-panel' aria-label='Account access'>
          {children}
          <div className='sign-in-access-note'>
            {footer ?? (
              <p>
                Need access? Contact your organization’s Preflyt Owner or Admin.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
