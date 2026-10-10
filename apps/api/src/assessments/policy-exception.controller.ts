import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsISO8601,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service.js";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../auth/session.guard.js";
import { PolicyExceptionService } from "./policy-exception.service.js";
class RequestDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) expectedPolicyHash!: string;
  @IsString() @Matches(/^[a-f0-9]{40}$/) sourceSha!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  ruleIds!: string[];
  @IsString() @MinLength(20) @MaxLength(2000) reason!: string;
  @IsISO8601({ strict: true }) expiresAt!: string;
}
class DecisionDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) expectedHash!: string;
  @IsInt() @Min(1) @Max(2147483647) expectedRevision!: number;
}
type SessionRequest = Request & { preflytSession: AuthenticatedSession };
@Controller(
  "github/repositories/:repositoryId/gate-policies/:policyId/exceptions",
)
@UseGuards(SessionGuard)
export class PolicyExceptionController {
  constructor(
    @Inject(PolicyExceptionService)
    private readonly service: PolicyExceptionService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get()
  @Header("Cache-Control", "no-store")
  list(
    @Param("repositoryId") repo: string,
    @Param("policyId") policy: string,
    @Req() request: SessionRequest,
  ) {
    return this.service.list(request.preflytSession, repo, policy);
  }
  @Post()
  @Header("Cache-Control", "no-store")
  create(
    @Param("repositoryId") repo: string,
    @Param("policyId") policy: string,
    @Body() body: RequestDto,
    @Req() request: SessionRequest,
  ) {
    this.auth.assertOrigin(request.headers.origin);
    return this.service.request(request.preflytSession, repo, policy, body);
  }
  @Post(":exceptionId/:decision")
  @Header("Cache-Control", "no-store")
  decide(
    @Param("repositoryId") repo: string,
    @Param("policyId") policy: string,
    @Param("exceptionId") id: string,
    @Param("decision") decision: string,
    @Body() body: DecisionDto,
    @Req() request: SessionRequest,
  ) {
    this.auth.assertOrigin(request.headers.origin);
    // Unknown actions cannot reach the service or be interpreted as approvals.
    const state = {
      approve: "APPROVED",
      reject: "REJECTED",
      revoke: "REVOKED",
    } as const;
    if (!Object.hasOwn(state, decision))
      throw new BadRequestException("Choose approve, reject or revoke");
    return this.service.decide(
      request.preflytSession,
      repo,
      policy,
      id,
      body,
      state[decision as keyof typeof state],
    );
  }
}
