import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { SignInBackground, SignInIllustration } from './sign-in-illustration'
import './sign-in.css'

type SignInLayoutProps = {
  children: ReactNode
  footer?: ReactNode
}

/** Shared entry surface; organization onboarding keeps its separate AuthLayout. */
export function SignInLayout({ children, footer }: SignInLayoutProps) {
  const illustrationRef = useRef<HTMLDivElement>(null)
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
    <div className='preflyt-sign-in' data-motion-enabled={visible && inView}>
      <SignInBackground />
      <div ref={illustrationRef} className='sign-in-artwork'>
        <SignInIllustration />
      </div>

      <main className='sign-in-main'>
        <section className='sign-in-panel' aria-label='Account access'>
          <div className='sign-in-form-brand' role='img' aria-label='Preflyt'>
            <span className='sign-in-form-mark' aria-hidden='true'>
              <ShieldCheck className='size-6' strokeWidth={2} />
            </span>
            <span className='sign-in-form-name' aria-hidden='true'>
              Preflyt
            </span>
          </div>
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
