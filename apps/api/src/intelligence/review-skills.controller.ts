import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service.js";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../auth/session.guard.js";
import { ReviewSkillsService } from "./review-skills.service.js";
import { SkillReviewService } from "./skill-review.service.js";
type R = Request & { preflytSession: AuthenticatedSession };
class SkillDto {
  @IsString() @MaxLength(100) name!: string;
  @IsString() @MaxLength(400) description!: string;
  @IsString() @MaxLength(6000) instructions!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsIn(
    ["laptop", "repository", "pull_request", "qa", "performance", "production"],
    { each: true },
  )
  stages!: string[];
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Matches(/^[1-9]\d{0,15}$/, { each: true })
  repositories!: string[];
  @IsString() @MaxLength(300) source!: string;
  @IsString() @MaxLength(100) license!: string;
  @IsOptional() @IsUUID() skillKey?: string;
  @IsInt() @Min(0) @Max(199) expectedVersion!: number;
}
class ActionDto {
  @Matches(/^[a-f0-9]{64}$/) expectedDigest!: string;
  @IsBoolean() reviewed!: boolean;
}
class ReviewDto {
  @IsString() @MaxLength(100) assessmentId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  skillIds!: string[];
}
@Controller("ai/skills")
@UseGuards(SessionGuard)
export class ReviewSkillsController {
  constructor(
    @Inject(ReviewSkillsService) private readonly skills: ReviewSkillsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get() @Header("Cache-Control", "no-store") list(@Req() req: R) {
    return this.skills.list(req.preflytSession);
  }
  @Post() @Header("Cache-Control", "no-store") create(
    @Req() req: R,
    @Body() body: SkillDto,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.skills.create(req.preflytSession, body);
  }
  @Post(":id/:action") @Header("Cache-Control", "no-store") action(
    @Req() req: R,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: ActionDto,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    if (!["approve", "enable", "disable", "retire"].includes(action))
      throw new BadRequestException("Unsupported skill action");
    return this.skills.transition(
      req.preflytSession,
      id,
      action as "approve" | "enable" | "disable" | "retire",
      body.expectedDigest,
      body.reviewed,
    );
  }
}
@Controller("github/repositories/:repositoryId/ai-reviews")
@UseGuards(SessionGuard)
export class SkillReviewController {
  constructor(
    @Inject(SkillReviewService) private readonly reviews: SkillReviewService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get() @Header("Cache-Control", "no-store") list(
    @Req() req: R,
    @Param("repositoryId") repo: string,
    @Query("assessmentId") assessmentId: string,
  ) {
    return this.reviews.list(req.preflytSession, repo, assessmentId);
  }
  @Post() @Header("Cache-Control", "no-store") request(
    @Req() req: R,
    @Param("repositoryId") repo: string,
    @Body() body: ReviewDto,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.reviews.request(
      req.preflytSession,
      repo,
      body.assessmentId,
      body.skillIds,
    );
  }
  @Post(":id/cancel") @Header("Cache-Control", "no-store") cancel(
    @Req() req: R,
    @Param("repositoryId") repo: string,
    @Param("id") id: string,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.reviews.cancel(req.preflytSession, repo, id);
  }
}
