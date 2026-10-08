import 'dotenv/config'
import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module.js'
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.use(cookieParser())
  const webOrigin =
    process.env.WEB_ORIGIN ??
    (process.env.NODE_ENV !== 'production'
      ? 'http://localhost:5173'
      : undefined)
  app.enableCors({
    origin: webOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  })
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  )
  app.enableShutdownHooks()
  await app.listen(
    Number(process.env.API_PORT ?? 3000),
    process.env.API_HOST ?? '127.0.0.1'
  )
}
void bootstrap()
