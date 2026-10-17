import {Module} from '@nestjs/common'
import {AuthModule} from '../auth/auth.module.js'
import {PrismaModule} from '../prisma/prisma.module.js'
import {InstallationReportingController} from './installation-reporting.controller.js'
import {InstallationReportingService} from './installation-reporting.service.js'
@Module({imports:[AuthModule,PrismaModule],controllers:[InstallationReportingController],providers:[InstallationReportingService]})
export class InstallationReportingModule{}
