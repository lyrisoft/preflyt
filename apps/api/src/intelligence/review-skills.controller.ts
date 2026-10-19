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
import { Transform } from "class-transformer";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service.js";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../auth/session.guard.js";
import { ReviewSkillsService } from "./review-skills.service.js";
import { SkillReviewService } from "./skill-review.service.js";
import { skillLimits, skillLengthMessage } from "./review-skills.js";
import { skillMarkdownMaxBytes } from "./skill-markdown.js";
type R = Request & { preflytSession: AuthenticatedSession };
class SkillDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  languages?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  frameworks?: string[];
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(skillLimits.name, {
    message: (args) => skillLengthMessage("Name", skillLimits.name, args.value),
  })
  name!: string;
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(skillLimits.description, {
    message: (args) =>
      skillLengthMessage("Description", skillLimits.description, args.value),
  })
  description!: string;
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(skillLimits.instructions, {
    message: (args) =>
      skillLengthMessage("Instructions", skillLimits.instructions, args.value),
  })
  instructions!: string;
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
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(skillLimits.source, {
    message: (args) =>
      skillLengthMessage("Source", skillLimits.source, args.value),
  })
  source!: string;
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(skillLimits.license, {
    message: (args) =>
      skillLengthMessage("License", skillLimits.license, args.value),
  })
  license!: string;
  @IsOptional() @IsUUID() skillKey?: string;
  @IsInt() @Min(0) @Max(199) expectedVersion!: number;
}
class UpstreamDto {
  @IsString() @MaxLength(70) repository!: string;
  @Matches(/^[a-f0-9]{40}$/) commit!: string;
  @IsString() @MaxLength(80) path!: string;
  @IsString() @MaxLength(80) licensePath!: string;
}
class MarkdownDto {
  @IsString()
  @MaxLength(skillMarkdownMaxBytes, {
    message: "File: maximum 128 KiB of Markdown text.",
  })
  markdown!: string;
}
class ActionDto {
  @Matches(/^[a-f0-9]{64}$/) expectedDigest!: string;
  @IsBoolean() reviewed!: boolean;
}
class ReviewDto {
  @IsOptional() @IsBoolean() includeSource?: boolean;
  @IsString() @MaxLength(100) assessmentId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @Matches(/^ai-review-[a-f0-9-]{36}$/, { each: true })
  checkIds!: string[];
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
  @Post("upstream") @Header("Cache-Control", "no-store") upstream(
    @Req() req: R,
    @Body() body: UpstreamDto,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.skills.upstream(req.preflytSession, body);
  }
  @Post("parse") @Header("Cache-Control", "no-store") parse(
    @Req() req: R,
    @Body() body: MarkdownDto,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.skills.parseMarkdown(req.preflytSession, body.markdown);
  }
  @Get("builtins/:id/markdown")
  @Header("Cache-Control", "no-store")
  @Header("Content-Type", "text/markdown; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="SKILL.md"')
  @Header("X-Content-Type-Options", "nosniff")
  builtinMarkdown(@Req() req: R, @Param("id") id: string) {
    return this.skills.builtinMarkdown(req.preflytSession, id);
  }
  @Post("builtins/:id/use") @Header("Cache-Control", "no-store") useBuiltin(
    @Req() req: R,
    @Param("id") id: string,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.skills.useBuiltin(req.preflytSession, id);
  }
  @Get(":id/markdown")
  @Header("Cache-Control", "no-store")
  @Header("Content-Type", "text/markdown; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="SKILL.md"')
  @Header("X-Content-Type-Options", "nosniff")
  markdown(@Req() req: R, @Param("id") id: string) {
    return this.skills.markdown(req.preflytSession, id);
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
      body.checkIds,
      { includeSource: body.includeSource ?? false },
    );
  }
  @Post(":id/retry") @Header("Cache-Control", "no-store") retry(
    @Req() req: R,
    @Param("repositoryId") repo: string,
    @Param("id") id: string,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.reviews.retry(req.preflytSession, repo, id);
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
