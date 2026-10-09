// This dedicated entry point never loads API/worker credentials or the default kube context.
import { createNativeController } from './execution/native-controller.js'
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
]
if (forbidden.some((key) => process.env[key]))
  throw new Error(
    'Native controller must use its dedicated secret-free deployment environment',
  )
const port = Number(process.env.NATIVE_CONTROLLER_PORT ?? '3010')
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid native controller port')
const server = createNativeController()
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
