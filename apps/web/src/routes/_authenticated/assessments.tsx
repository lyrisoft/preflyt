import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceModule } from '@/features/workspace/module-page'
import { workspaceSearchSchema } from '@/features/workspace/search-schema'

export const Route = createFileRoute('/_authenticated/assessments')({
  validateSearch: workspaceSearchSchema,
  component: () => <WorkspaceModule module='assessments' />,
})
