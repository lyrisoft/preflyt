import { BadRequestException, Body, Controller, Get, Header, Inject, Param, Post, Query, Req, StreamableFile, UseGuards, ValidationPipe } from '@nestjs/common'
import { IsBoolean, IsIn, IsInt, Min, Max, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'
import type { Request } from 'express'
import { SessionGuard, type AuthenticatedSession } from '../auth/session.guard.js'
import { AuthService } from '../auth/auth.service.js'
import { RepositoryHealthService } from './repository-health.service.js'
import type { HealthCategory } from './health-categories.js'
import { paymentRiskMarkdown, paymentRiskPdf } from './payment-risk-export.js'
type SessionRequest = Request & { preflytSession?: AuthenticatedSession }
class HealthRequest {
 @IsOptional() @IsString() @MaxLength(244) branch?: string
 @IsOptional() @IsBoolean() includeCoverage?: boolean
 @IsOptional() @IsBoolean() includeAiSecurity?: boolean
 @IsOptional() @IsIn(['security','reliability','maintainability','duplication','coverage']) category?: HealthCategory
 @IsOptional() @IsIn(['general','payment-risk-v1','general-and-payment-risk-v1']) reviewProfile?: 'general' | 'payment-risk-v1' | 'general-and-payment-risk-v1'
 @IsOptional() @IsIn(['strix']) scanner?: 'strix'
 @IsUUID('4') requestKey!: string
}
class HotspotReviewRequest {
 @IsIn(['TO_REVIEW','IN_REVIEW','SAFE','FIX_REQUIRED']) state!: string
 @IsString() @MaxLength(1000) note!: string
 @IsInt() @Min(0) @Max(2147483646) expectedRevision!: number
}
@Controller('github')
@UseGuards(SessionGuard)
export class RepositoryHealthController {
 constructor(@Inject(RepositoryHealthService) private health: RepositoryHealthService, @Inject(AuthService) private auth: AuthService) {}
 @Get('health') @Header('Cache-Control','no-store')
 portfolio(@Req() req: SessionRequest, @Query('page') page = '1', @Query('q') q = '', @Query('repository') repository?: string, @Query('pageSize') pageSize = '25') { return this.health.portfolio(req.preflytSession!, Number(page), q, repository, Number(pageSize)) }
 @Get('repositories/:repositoryId/health') @Header('Cache-Control','no-store')
 get(@Req() req: SessionRequest, @Param('repositoryId') repo: string, @Query('assessment') id?: string, @Query('page') page = '1', @Query('branch') branch?: string, @Query('pageSize') pageSize?: string) { return this.health.get(req.preflytSession!,repo,id,Number(page),branch,pageSize) }
 @Get('repositories/:repositoryId/health/freshness') @Header('Cache-Control','no-store')
 freshness(@Req() req: SessionRequest, @Param('repositoryId') repo: string, @Query('assessment') id = '') { return this.health.freshness(req.preflytSession!,repo,id) }
 @Get('repositories/:repositoryId/health/strix') @Header('Cache-Control','no-store')
 strix(@Req() req:SessionRequest,@Param('repositoryId') repo:string) {return this.health.strixAvailability(req.preflytSession!,repo)}
 @Post('repositories/:repositoryId/health')
 start(@Req() req: SessionRequest, @Param('repositoryId') repo: string, @Body(new ValidationPipe({whitelist: true, forbidNonWhitelisted: true, transform: true, expectedType: HealthRequest})) input: HealthRequest) { this.auth.assertOrigin(req.headers.origin); return this.health.start(req.preflytSession!,repo,input) }
 @Post('repositories/:repositoryId/health/:id/cancel')
 cancel(@Req() req: SessionRequest, @Param('repositoryId') repo: string, @Param('id') id: string) { this.auth.assertOrigin(req.headers.origin); return this.health.cancel(req.preflytSession!,repo,id) }
 @Get('repositories/:repositoryId/health/:id/payment-risk-report') @Header('Cache-Control','no-store')
 async paymentRiskReport(@Req() req:SessionRequest,@Param('repositoryId') repo:string,@Param('id') id:string,@Query('format') format?:string) {
  if(format!==undefined && !['md','pdf'].includes(format)) throw new BadRequestException('Choose Markdown or PDF')
  const data=await this.health.paymentRiskReport(req.preflytSession!,repo,id)
  if(!format)return data
  const body=format==='md' ? Buffer.from(paymentRiskMarkdown(data),'utf8') : await paymentRiskPdf(data)
  return new StreamableFile(body,{type:format==='md'?'text/markdown; charset=utf-8':'application/pdf',disposition:`attachment; filename="payment-risk-${id}.${format}"`})
 }
 @Get('repositories/:repositoryId/health/:id/findings') @Header('Cache-Control','no-store')
 findings(@Req() req:SessionRequest,@Param('repositoryId') repo:string,@Param('id') id:string,@Query() query:{page?:string;pageSize?:string;q?:string;severity?:string;reports?:string}) {return this.health.findings(req.preflytSession!,repo,id,query)}
 @Get('repositories/:repositoryId/health/:id/hotspots/:fingerprint/review') @Header('Cache-Control','no-store')
 hotspotReview(@Req() req:SessionRequest,@Param('repositoryId') repo:string,@Param('id') id:string,@Param('fingerprint') fingerprint:string) {return this.health.hotspotReview(req.preflytSession!,repo,id,fingerprint)}
 @Post('repositories/:repositoryId/health/:id/hotspots/:fingerprint/review') @Header('Cache-Control','no-store')
 saveHotspotReview(@Req() req:SessionRequest,@Param('repositoryId') repo:string,@Param('id') id:string,@Param('fingerprint') fingerprint:string,@Body(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true,expectedType:HotspotReviewRequest})) input:HotspotReviewRequest) {this.auth.assertOrigin(req.headers.origin);return this.health.saveHotspotReview(req.preflytSession!,repo,id,fingerprint,input)}
 @Get('repositories/:repositoryId/health/:id/findings/:fingerprint') @Header('Cache-Control','no-store')
 findingDetail(@Req() req:SessionRequest,@Param('repositoryId') repo:string,@Param('id') id:string,@Param('fingerprint') fingerprint:string) {return this.health.findingDetail(req.preflytSession!,repo,id,fingerprint)}
 @Get('repositories/:repositoryId/health/:id/findings/:fingerprint/source') @Header('Cache-Control','no-store')
 source(@Req() req: SessionRequest, @Param('repositoryId') repo: string, @Param('id') id: string, @Param('fingerprint') fingerprint: string, @Query('location') location?: string) { return this.health.source(req.preflytSession!,repo,id,fingerprint,location) }
}
