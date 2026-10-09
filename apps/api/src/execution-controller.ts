// This dedicated entry point never loads API/worker credentials or the default kube context.
import { createNativeController } from './execution/native-controller.js'
import {
  nativeDockerApproval,
  dockerControlsProjection,
} from './execution/native-docker-approval.js'
import { dockerCommand } from './execution/native-docker-job.js'
import { nativeToolReviews } from './execution/native-plan.js'
import { digest } from './assessments/assessment-digest.js'
const forbidden = [
  'DATABASE_URL',
  'QUEUE_REDIS_URL',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_GOVERNANCE_APP_PRIVATE_KEY',
  'GITHUB_GOVERNANCE_PRIVATE_KEY',
  'GITHUB_APP_CLIENT_SECRET',
  'GITHUB_USER_TOKEN_ENCRYPTION_KEY',
  'OIDC_CLIENT_SECRET',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AZURE_CLIENT_SECRET',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'REDIS_URL',
  'SMTP_PASSWORD',
  'AI_PROVIDER_ENCRYPTION_KEY',
]
if (forbidden.some((key) => process.env[key]))
  throw new Error(
    'Native controller must use its dedicated secret-free deployment environment',
  )
const port = Number(process.env.NATIVE_CONTROLLER_PORT ?? '3010')
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid native controller port')
const backend = process.env.NATIVE_RUNTIME_BACKEND ?? 'kubernetes'
if (!['docker', 'kubernetes'].includes(backend))
  throw new Error('Invalid native runtime backend')
const server = createNativeController(
  undefined,
  backend === 'docker'
    ? {
        review: nativeDockerApproval,
        observe: async (reviewed) => {
          if (!('runtime' in reviewed.approval))
            throw new Error('Docker review required')
          const controlsHash = digest(
            dockerControlsProjection(
              JSON.parse(
                (
                  await dockerCommand(['info', '--format', '{{json .}}'])
                ).toString(),
              ),
              reviewed.approval.runtime,
            ),
          )
          const failed = [
            ...(controlsHash !== reviewed.approval.controlsHash
              ? ['Docker controls changed']
              : []),
            ...(nativeToolReviews()?.reviewHash !==
            reviewed.approval.toolReviewHash
              ? ['Tool review changed']
              : []),
          ]
          return { verified: failed.length === 0, failed, controlsHash }
        },
      }
    : undefined,
)
server.listen(port, process.env.NATIVE_CONTROLLER_HOST ?? '0.0.0.0', () =>
  console.info(
    'Native execution preflight controller started; repository execution is disabled',
  ),
)
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => {
    server.close()
    server.closeAllConnections()
  })
