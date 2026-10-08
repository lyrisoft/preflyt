import {
  BookOpen,
  BrainCircuit,
  ShieldCheck,
  ShieldAlert,
  UsersRound,
  Settings,
  Command,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  Plug,
  SlidersHorizontal,
} from 'lucide-react'
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
      plan: 'Engineering Assurance Platform',
    },
  ],
  navGroups: [
    {
      title: 'Workspace',
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
        { title: 'Assessments', url: '/assessments', icon: ListChecks },
        {
          title: 'Findings',
          url: '/findings',
          icon: ShieldAlert,
          badge: 'Planned',
        },
      ],
    },
    {
      title: 'Governance',
      items: [
        {
          title: 'Quality Gates',
          url: '/quality-gates',
          icon: ShieldCheck,
          badge: 'Planned',
        },
        { title: 'Engineering Standards', url: '/standards', icon: BookOpen },
        { title: 'Policies', url: '/policies', icon: SlidersHorizontal },
      ],
    },
    {
      title: 'Intelligence',
      items: [
        {
          title: 'AI Intelligence',
          url: '/intelligence',
          icon: BrainCircuit,
          badge: 'Planned',
        },
      ],
    },
    {
      title: 'Administration',
      items: [
        { title: 'Integrations', url: '/integrations', icon: Plug },
        {
          title: 'Access Control',
          url: '/access-control',
          icon: UsersRound,
          adminOnly: true,
          badge: 'Planned',
        },
        {
          title: 'Settings',
          url: '/organization-settings',
          icon: Settings,
          adminOnly: true,
          badge: 'Planned',
        },
      ],
    },
  ],
}
