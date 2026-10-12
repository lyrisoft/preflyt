import {
  History,
  BookOpen,
  BrainCircuit,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  UsersRound,
  Settings,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  Plug,
  SlidersHorizontal,
} from 'lucide-react'
import { PreflytMark } from '@/components/preflyt-brand'
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
      logo: PreflytMark,
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
        },
        { title: 'Contributors', url: '/contributors', icon: UsersRound },
      ],
    },
    {
      title: 'Governance',
      items: [
        {
          title: 'Merge Protection',
          url: '/quality-gates',
          icon: ShieldCheck,
          badge: 'Preview',
        },
        { title: 'Standards', url: '/standards', icon: BookOpen },
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
          badge: 'Preview',
        },
        { title: 'Skills', url: '/skills', icon: Sparkles },
      ],
    },
    {
      title: 'Administration',
      items: [
        { title: 'Integrations', url: '/integrations', icon: Plug },
        { title: 'Teams', url: '/teams', icon: UsersRound },
        {
          title: 'Access Control',
          url: '/access-control',
          icon: UsersRound,
          adminOnly: true,
        },
        {
          title: 'Audit log',
          url: '/audit-log',
          icon: History,
          roles: ['OWNER', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN'],
        },
        {
          title: 'Settings',
          url: '/organization-settings',
          icon: Settings,
        },
      ],
    },
  ],
}
