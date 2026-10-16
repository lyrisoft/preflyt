import { useEffect } from 'react'
import { publicPages } from './public-pages'

export function PageMetadata({
  path,
}: {
  path: (typeof publicPages)[number]['path']
}) {
  useEffect(() => {
    const page = publicPages.find((page) => page.path === path)!
    document.title = page.title
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', page.description)
  }, [path])
  return null
}
