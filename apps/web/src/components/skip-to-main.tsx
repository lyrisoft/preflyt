export function SkipToMain() {
  return (
    <a
      className='fixed start-4 top-3 z-999 max-w-[calc(100%-2rem)] -translate-y-[calc(100%+1rem)] rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-transform hover:bg-primary/90 focus:translate-y-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      href='#content'
      onClick={(event) => {
        const main = document.getElementById('content')
        if (!main) return
        event.preventDefault()
        main.focus({ preventScroll: true })
        main.scrollIntoView({ block: 'start' })
      }}
    >
      Skip to main content
    </a>
  )
}
