import { recordRequest, telemetryLog, shutdownTelemetry } from './telemetry.js'
import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module.js'
import { apiCorsOptions } from './config/api-cors.js'
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true })
  app.useBodyParser('json', { limit: '1mb' })
  app.use(cookieParser())
  app.use((req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    const start = performance.now()
    res.once('finish', () => recordRequest(req.method, res.statusCode, performance.now() - start))
    next()
  })
  const webOrigin =
    process.env.WEB_ORIGIN ??
    (process.env.NODE_ENV !== 'production'
      ? 'http://localhost:5173'
      : undefined)
  app.enableCors(apiCorsOptions(webOrigin))
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  )
  app.enableShutdownHooks()
  process.once('SIGTERM', () => void shutdownTelemetry())
  process.once('SIGINT', () => void shutdownTelemetry())
  await app.listen(
    Number(process.env.API_PORT ?? 3000),
    process.env.API_HOST ?? '127.0.0.1'
  )
  telemetryLog('preflyt.api.started')
}
void bootstrap()
