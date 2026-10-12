import { useEffect, useRef } from 'react'
import { useRouterState } from '@tanstack/react-router'
import LoadingBar, { type LoadingBarRef } from 'react-top-loading-bar'
import { useClientReady } from '@/hooks/use-client-ready'

export function NavigationProgress() {
  const clientReady = useClientReady()
  const ref = useRef<LoadingBarRef>(null)
  const state = useRouterState()

  useEffect(() => {
    if (state.status === 'pending') {
      ref.current?.continuousStart()
    } else {
      ref.current?.complete()
    }
  }, [state.status])

  if (!clientReady) return null

  return (
    <LoadingBar
      color='var(--muted-foreground)'
      ref={ref}
      shadow={true}
      height={2}
    />
  )
}
