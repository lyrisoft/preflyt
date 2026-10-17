import {Module} from '@nestjs/common'
import {AuthModule} from '../auth/auth.module.js'
import {PrismaModule} from '../prisma/prisma.module.js'
import {ReleasesController} from './releases.controller.js'
import {ReleasesService} from './releases.service.js'
@Module({imports:[AuthModule,PrismaModule],controllers:[ReleasesController],providers:[ReleasesService]})
export class ReleasesModule{}
