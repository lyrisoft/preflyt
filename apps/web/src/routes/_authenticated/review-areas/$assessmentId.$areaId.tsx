import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { ReviewAreaDetailsPage } from '@/features/health/review-area-details-page'

export const Route = createFileRoute(
  '/_authenticated/review-areas/$assessmentId/$areaId'
)({
  validateSearch: z.object({
    repository: z
      .string()
      .regex(/^[1-9][0-9]{0,15}$/)
      .optional()
      .catch(undefined),
  }),
  component: function ReviewAreaRoute() {
    const { assessmentId, areaId } = Route.useParams()
    const { repository } = Route.useSearch()
    return (
      <ReviewAreaDetailsPage
        assessmentId={assessmentId}
        areaId={areaId}
        repositoryId={repository}
      />
    )
  },
})
