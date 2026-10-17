import {Body,Controller,Get,Post,Header,Inject,Req,UseGuards} from '@nestjs/common'
import type {Request} from 'express'
import {AuthService} from '../auth/auth.service.js'
import {SessionGuard,type AuthenticatedSession} from '../auth/session.guard.js'
import {ReleasesService} from './releases.service.js'
type SessionRequest=Request&{preflytSession:AuthenticatedSession}
@Controller('releases') @UseGuards(SessionGuard)
export class ReleasesController {
 constructor(@Inject(ReleasesService)private readonly releases:ReleasesService,@Inject(AuthService)private readonly auth:AuthService){}
 @Get() @Header('Cache-Control','no-store') status(@Req()r:SessionRequest){return this.releases.status(r.preflytSession)}
 @Post('check') @Header('Cache-Control','no-store') check(@Req()r:SessionRequest){this.auth.assertOrigin(r.headers.origin);return this.releases.refresh(r.preflytSession)}
 @Post('preferences') @Header('Cache-Control','no-store') preferences(@Req()r:SessionRequest,@Body()body:unknown){this.auth.assertOrigin(r.headers.origin);return this.releases.settings(r.preflytSession,body)}
 @Post('read') @Header('Cache-Control','no-store') read(@Req()r:SessionRequest,@Body()body:{tag?:unknown}){this.auth.assertOrigin(r.headers.origin);return this.releases.read(r.preflytSession,body?.tag)}
}
