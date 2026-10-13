import { useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import { MarketingLayout } from './marketing-layout'

export function PublicNotFound() {
  useEffect(() => {
    document.title = 'Page not found | Preflyt'
    document
      .querySelector('meta[name="robots"]')
      ?.setAttribute('content', 'noindex, nofollow')
  }, [])
  return (
    <MarketingLayout>
      <main id='main' className='public-not-found container'>
        <p className='reference-label'>Page not found · 404</p>
        <h1>
          This path doesn’t <br />
          lead anywhere.
        </h1>
        <p>
          The page may have moved, or the address may be incomplete. Start with
          the product or return to the homepage.
        </p>
        <div className='reference-actions'>
          <a className='button' href='/'>
            Public homepage <ArrowRight size={15} aria-hidden='true' />
          </a>
          <a className='text-link' href='/product'>
            Explore Preflyt <ArrowRight size={15} aria-hidden='true' />
          </a>
        </div>
      </main>
    </MarketingLayout>
  )
}
