import { useEffect, useRef, useState } from 'react'
import {
  UsersRound,
  Search,
  Bell,
  ChevronsUpDown,
  Moon,
  PanelLeft,
  Settings,
} from 'lucide-react'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { sidebarData } from '@/components/layout/data/sidebar-data'
import { PageHeader } from '@/components/page-header'
import { PreflytMark } from '@/components/preflyt-brand'
import { ContributorsPreview } from './contributors-preview'
import { FindingsPreview } from './findings-preview'
import { ProductPreview } from './product-preview'
import { RepositoryPreview } from './repository-preview'

type View = 'overview' | 'findings' | 'contributors' | 'repository'
const viewLabels: Record<View, string> = {
  overview: 'Overview',
  findings: 'Findings',
  contributors: 'Contributors',
  repository: 'Repository health',
}
/** Scaled presentation of real demo page components; no authenticated queries. */
export function WorkspaceWindow({
  initialView = 'overview',
  controls = true,
  showNavigation = controls,
  showRepositoryEvidence = true,
}: {
  initialView?: View
  controls?: boolean
  showNavigation?: boolean
  showRepositoryEvidence?: boolean
}) {
  const [view, setView] = useState<View>(initialView)
  const [scale, setScale] = useState(0.6)
  const [height, setHeight] = useState(980)
  const ref = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) =>
      setScale(Math.min(1, entry.contentRect.width / 1728))
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const observer = new ResizeObserver(() =>
      setHeight(Math.max(860, content.offsetHeight + 64))
    )
    observer.observe(content)
    return () => observer.disconnect()
  }, [])
  const destinations: Record<string, View> = {
    '/overview': 'overview',
    '/repositories': 'repository',
    '/findings': 'findings',
    '/contributors': 'contributors',
  }
  const selected = view === 'repository' ? 'Repositories' : viewLabels[view]
  return (
    <div className='workspace-presentation'>
      {showNavigation && (
        <div
          className='workspace-view-controls'
          role='group'
          aria-label='Choose a complete workspace page'
        >
          {(
            ['overview', 'findings', 'contributors', 'repository'] as View[]
          ).map((item) => (
            <button
              type='button'
              key={item}
              aria-pressed={view === item}
              onClick={() => setView(item)}
            >
              {viewLabels[item]}
            </button>
          ))}
        </div>
      )}
      <div
        ref={ref}
        className={
          controls
            ? 'workspace-window workspace-window-interactive'
            : 'workspace-window'
        }
        style={controls ? undefined : { height: scale * height }}
        role={controls ? 'region' : 'img'}
        aria-label={
          controls
            ? `Explore the ${view} page in Northstar`
            : `${viewLabels[view]} in Northstar with populated charts, recorded metrics and revision context`
        }
      >
        <div
          className='workspace-window-canvas product-preview dark'
          style={
            controls ? undefined : { transform: `scale(${scale})`, height }
          }
          inert={!controls}
          aria-hidden={!controls}
        >
          <div className='workspace-window-layout'>
            <aside
              className='workspace-window-sidebar'
              aria-label='Workspace navigation'
            >
              <div className='workspace-organization'>
                <PreflytMark className='size-10' />
                <div>
                  <strong>Northstar</strong>
                  <span>GitHub organization</span>
                </div>
                <ChevronsUpDown size={16} aria-hidden='true' />
              </div>
              <div className='workspace-navigation'>
                {sidebarData.navGroups.map((group) => (
                  <SidebarGroup key={group.title}>
                    <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
                    <SidebarMenu>
                      {group.items.map((item) => {
                        const destination = item.url && destinations[item.url]
                        const contents = (
                          <>
                            {item.icon && (
                              <item.icon size={16} aria-hidden='true' />
                            )}
                            <span>{item.title}</span>
                          </>
                        )
                        return (
                          <SidebarMenuItem key={item.title}>
                            {controls && destination ? (
                              <button
                                type='button'
                                className='workspace-navigation-item'
                                data-active={item.title === selected}
                                onClick={() => setView(destination)}
                              >
                                {contents}
                              </button>
                            ) : (
                              <div
                                className='workspace-navigation-item'
                                data-active={item.title === selected}
                              >
                                {contents}
                              </div>
                            )}
                          </SidebarMenuItem>
                        )
                      })}
                    </SidebarMenu>
                  </SidebarGroup>
                ))}
              </div>
              <div className='workspace-account'>
                <span className='workspace-account-avatar'>PF</span>
                <div>
                  <strong>Workspace Admin</strong>
                  <span>Signed-in account</span>
                </div>
                <ChevronsUpDown size={16} aria-hidden='true' />
              </div>
            </aside>
            <div className='workspace-window-main @container/content'>
              <header>
                <div className='workspace-breadcrumb'>
                  <PanelLeft size={18} aria-hidden='true' />
                  <i />
                  <strong>
                    {view === 'repository'
                      ? 'Repositories › Northstar / platform-api'
                      : viewLabels[view]}
                  </strong>
                </div>
                <div className='workspace-global-controls' aria-hidden='true'>
                  <span className='workspace-search'>
                    <Search size={16} /> Search <kbd>⌘ K</kbd>
                  </span>
                  <Bell size={18} />
                  <Moon size={18} />
                  <Settings size={18} />
                  <span className='workspace-account-avatar'>PF</span>
                </div>
              </header>
              <div ref={contentRef} className='workspace-window-content'>
                {view === 'overview' ? (
                  <ProductPreview />
                ) : view === 'findings' ? (
                  <FindingsPreview />
                ) : view === 'contributors' ? (
                  <div className='space-y-4'>
                    <PageHeader
                      headingLevel={2}
                      title='Contributors'
                      section='Engineering activity'
                      description='Recorded GitHub participation and PR revision evidence.'
                      icon={UsersRound}
                      tone='blue'
                    />
                    <ContributorsPreview />
                  </div>
                ) : (
                  <RepositoryPreview showEvidence={showRepositoryEvidence} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
