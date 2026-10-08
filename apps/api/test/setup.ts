import { config } from 'dotenv'
import { createHash } from 'node:crypto'

config({ path: '.env.test' })
process.env.NODE_ENV = 'test'
process.env.OIDC_ISSUER = 'http://127.0.0.1:1'
process.env.OIDC_CLIENT_ID = 'preflyt-test-client'
process.env.OIDC_CLIENT_SECRET = 'test-client-secret'
process.env.OIDC_REDIRECT_URI = 'http://localhost:3000/auth/callback'
process.env.WEB_ORIGIN = 'http://localhost:5173'
process.env.COOKIE_SECURE = 'false'
process.env.BOOTSTRAP_TOKEN_SHA256 = createHash('sha256')
  .update('test-bootstrap-token-value-000000000000')
  .digest('hex')
