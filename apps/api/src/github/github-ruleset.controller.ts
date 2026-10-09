import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../auth/session.guard.js";
import { GitHubRulesetService } from "./github-ruleset.service.js";
@Controller("github/repositories/:repositoryId/rulesets")
@UseGuards(SessionGuard)
export class GitHubRulesetController {
  constructor(
    @Inject(GitHubRulesetService)
    private readonly rulesets: GitHubRulesetService,
  ) {}
  @Get()
  @Header("Cache-Control", "no-store")
  list(
    @Req() req: Request & { preflytSession?: AuthenticatedSession },
    @Param("repositoryId") repositoryId: string,
    @Query("page") page?: string,
  ) {
    return this.rulesets.list(
      req.preflytSession!,
      repositoryId,
      page === undefined ? 1 : Number(page),
    );
  }
  @Get(":rulesetId/insights")
  @Header("Cache-Control", "no-store")
  insights(
    @Req() req: Request & { preflytSession: AuthenticatedSession },
    @Param("repositoryId") repositoryId: string,
    @Param("rulesetId") id: string,
    @Query("page") page?: string,
    @Query("period") period?: string,
    @Query("ref") ref?: string,
    @Query("actor") actor?: string,
    @Query("result") result?: string,
    @Query("source") source?: string,
  ) {
    return this.rulesets.insights(
      req.preflytSession,
      repositoryId,
      Number(id),
      {
        page: page === undefined ? 1 : Number(page),
        period: period ?? "week",
        ref,
        actor,
        result,
        source,
      },
    );
  }
  @Get(":rulesetId")
  @Header("Cache-Control", "no-store")
  detail(
    @Req() req: Request & { preflytSession?: AuthenticatedSession },
    @Param("repositoryId") repositoryId: string,
    @Param("rulesetId") id: string,
  ) {
    return this.rulesets.detail(req.preflytSession!, repositoryId, Number(id));
  }
}
