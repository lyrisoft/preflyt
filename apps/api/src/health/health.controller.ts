import { Controller, Get } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('live')
  live() { return { status: 'ok' } }
  @Get('ready')
  async ready() {
    await this.prisma.$queryRawUnsafe('SELECT 1')
    return { status: 'ready' }
  }
}
