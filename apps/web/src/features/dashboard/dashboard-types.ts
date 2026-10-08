export type DashboardData = {
  version: number
  generatedAt: string
  period: { days: number; from: string; to: string; timezone: string }
  choices: { githubId: string; fullName: string }[]
  metrics: {
    repositories: number
    snapshots: number
    prsAssessed: number
    standardsAdopted: number
    repositoriesWithSnapshots: number
  }
  activity: { date: string; count: number }[]
  attention: {
    number: number
    repositoryId: string
    repository: string
    headRef: string | null
    headSha: string | null
    draft: boolean
    updatedAt: string | null
    reason: string
    readiness: string
  }[]
  attentionTruncated: boolean
  repositories: {
    githubId: string
    fullName: string
    technologies: string[]
    profileComplete: boolean | null
    policy: string | null
    latestAssessment: {
      id: string
      sourceSha: string
      createdAt: string
    } | null
    readiness: string
    sync: { state: string; verifiedAt: string | null }
  }[]
}
