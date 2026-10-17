import {Body,Controller,Get,Header,Inject,Post,Req,UseGuards} from '@nestjs/common'
import type {Request} from 'express'
import {AuthService} from '../auth/auth.service.js'
import {SessionGuard,type AuthenticatedSession} from '../auth/session.guard.js'
import {InstallationReportingService} from './installation-reporting.service.js'
type SessionRequest=Request&{preflytSession:AuthenticatedSession}
@Controller('installation-reporting') @UseGuards(SessionGuard)
export class InstallationReportingController{
 constructor(@Inject(InstallationReportingService)private readonly reporting:InstallationReportingService,@Inject(AuthService)private readonly auth:AuthService){}
 @Get() @Header('Cache-Control','no-store')status(@Req()req:SessionRequest){return this.reporting.status(req.preflytSession)}
 @Post('preferences') @Header('Cache-Control','no-store')preferences(@Req()req:SessionRequest,@Body()body:unknown){this.auth.assertOrigin(req.headers.origin);return this.reporting.preferences(req.preflytSession,body)}
 @Post('acknowledge') @Header('Cache-Control','no-store')acknowledge(@Req()req:SessionRequest){this.auth.assertOrigin(req.headers.origin);return this.reporting.acknowledge(req.preflytSession)}
}
