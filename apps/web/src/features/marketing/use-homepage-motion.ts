import { useEffect, type RefObject } from 'react'

/** Progressive enhancement: content stays visible before hydration and without JS. */
export function useHomepageMotion(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const homepage = root.classList.contains('marketing-home')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const animations = new Set<Animation>()
    const cancel = () => {
      animations.forEach((animation) => animation.cancel())
      animations.clear()
    }
    const keyboard = () => {
      root.dataset.input = 'keyboard'
      cancel()
    }
    const pointer = () => {
      root.dataset.input = 'pointer'
    }
    const animate = (element: Element, delay = 0) => {
      if (reduced.matches || root.dataset.input === 'keyboard') return
      const animation = element.animate(
        [
          {
            opacity: homepage ? 0.85 : 0,
            translate: homepage ? '0 6px' : '0 16px',
          },
          { opacity: 1, translate: '0 0' },
        ],
        {
          duration: homepage ? 220 : 480,
          delay,
          easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
          fill: 'backwards',
        }
      )
      animations.add(animation)
      animation.onfinish = () => animations.delete(animation)
    }
    root
      .querySelectorAll(
        homepage ? '.evidence-scene' : '.hero-copy > *, .evidence-scene'
      )
      .forEach((element, index) => animate(element, Math.min(index * 55, 220)))
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          animate(entry.target)
          observer.unobserve(entry.target)
        })
      },
      { threshold: 0.08 }
    )
    root
      .querySelectorAll(
        homepage
          ? '.reference-tour-heading'
          : '.reference-feature, .reference-tour-heading, .reference-process, .reference-hosting, .section-heading, .capability-card, .capability-boundary, .capability-limits, .operations-links, .feature, .ai-heading, .workflow-heading, .workflow-steps li, .hosting, .faq-section, .closing'
      )
      .forEach((element) => observer.observe(element))
    reduced.addEventListener('change', cancel)
    root.addEventListener('keydown', keyboard, true)
    root.addEventListener('pointerdown', pointer, true)
    return () => {
      observer.disconnect()
      cancel()
      reduced.removeEventListener('change', cancel)
      root.removeEventListener('keydown', keyboard, true)
      root.removeEventListener('pointerdown', pointer, true)
    }
  }, [ref])
}
