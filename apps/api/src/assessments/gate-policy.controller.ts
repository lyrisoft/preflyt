import {
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
  ArrayUnique,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from "class-validator";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service.js";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../auth/session.guard.js";
import { GatePolicyService } from "./gate-policy.service.js";
class DraftDto {
  @IsString() @MaxLength(80) expectedSelectionId!: string;
  @IsString() @MaxLength(255) branchRef!: string;
  @IsArray()
  @ArrayMaxSize(64)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  requiredRules!: string[];
}
class EditDraftDto extends DraftDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) expectedHash!: string;
}
class ApprovalDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) expectedHash!: string;
}
class PublicationDto extends ApprovalDto {
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(80)
  expectedPublishedId!: string | null;
}
type PolicyRequest = Request & { preflytSession: AuthenticatedSession };
@Controller("github/repositories/:repositoryId/gate-policies")
@UseGuards(SessionGuard)
export class GatePolicyController {
  constructor(
    @Inject(GatePolicyService) private readonly policies: GatePolicyService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get()
  @Header("Cache-Control", "no-store")
  list(@Param("repositoryId") id: string, @Req() request: PolicyRequest) {
    return this.policies.list(request.preflytSession, id);
  }
  @Post()
  @Header("Cache-Control", "no-store")
  draft(
    @Param("repositoryId") id: string,
    @Body() body: DraftDto,
    @Req() request: PolicyRequest,
  ) {
    this.auth.assertOrigin(request.headers.origin);
    return this.policies.draft(request.preflytSession, id, body);
  }
  @Post(":policyId/edit")
  @Header("Cache-Control", "no-store")
  edit(
    @Param("repositoryId") id: string,
    @Param("policyId") policy: string,
    @Body() body: EditDraftDto,
    @Req() request: PolicyRequest,
  ) {
    this.auth.assertOrigin(request.headers.origin);
    return this.policies.editDraft(request.preflytSession, id, policy, body);
  }
  @Post(":policyId/approve")
  @Header("Cache-Control", "no-store")
  approve(
    @Param("repositoryId") id: string,
    @Param("policyId") policy: string,
    @Body() body: ApprovalDto,
    @Req() request: PolicyRequest,
  ) {
    this.auth.assertOrigin(request.headers.origin);
    return this.policies.approve(
      request.preflytSession,
      id,
      policy,
      body.expectedHash,
    );
  }
  @Post(":policyId/publish")
  @Header("Cache-Control", "no-store")
  publish(
    @Param("repositoryId") id: string,
    @Param("policyId") policy: string,
    @Body() body: PublicationDto,
    @Req() request: PolicyRequest,
  ) {
    this.auth.assertOrigin(request.headers.origin);
    return this.policies.publish(
      request.preflytSession,
      id,
      policy,
      body.expectedHash,
      body.expectedPublishedId,
    );
  }
}
