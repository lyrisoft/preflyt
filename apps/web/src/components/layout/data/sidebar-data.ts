import { Command, GitBranch, LayoutDashboard } from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'Preflyt account',
    email: 'Signed-in account',
    avatar: '',
  },
  teams: [
    {
      name: 'Preflyt',
      logo: Command,
      plan: 'Engineering Control Plane',
    },
  ],
  navGroups: [
    {
      title: 'Engineering',
      items: [
        {
          title: 'Overview',
          url: '/',
          icon: LayoutDashboard,
        },
        {
          title: 'Repositories',
          url: '/apps',
          icon: GitBranch,
        },
      ],
    },
  ],
}
