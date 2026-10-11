import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { RulesetHistoryService } from "./ruleset-history.service.js";
import { GitHubProviderService } from "./github-provider.service.js";

@Injectable()
export class GitHubRulesetService {
  constructor(
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
    @Inject(GitHubProviderService)
    private readonly provider: GitHubProviderService,
    @Inject(RulesetHistoryService)
    private readonly history?: RulesetHistoryService,
  ) {}
  async list(
    session: AuthenticatedSession,
    repositoryId: string,
    page: number,
    refresh = false,
  ) {
    if (!Number.isInteger(page) || page < 1 || page > 1000)
      throw new BadRequestException("Invalid ruleset page");
    const repository = await this.access.requireRepository(
      session,
      repositoryId,
      "policy.read",
    );
    const result = await this.provider.listRepositoryRulesets(
      repository.installationId,
      repository.githubId,
      page,
      refresh,
    );
    await this.access.requireRepository(session, repositoryId, "policy.read");
    return result;
  }
  async insights(
    session: AuthenticatedSession,
    repositoryId: string,
    id: number,
    options: {
      page: number;
      period: string;
      ref?: string;
      actor?: string;
      result?: string;
      source?: string;
    },
  ) {
    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      !Number.isInteger(options.page) ||
      options.page < 1 ||
      options.page > 1000 ||
      !["live", "retained"].includes(options.source ?? "live") ||
      !(
        options.source === "retained"
          ? ["hour", "day", "week", "month", "quarter"]
          : ["hour", "day", "week", "month"]
      ).includes(options.period) ||
      !["all", "pass", "fail", "bypass"].includes(options.result ?? "all") ||
      (options.ref &&
        (options.ref.length > 255 || /[~*?\[\x00-\x20]/.test(options.ref))) ||
      (options.actor && !/^[a-zA-Z0-9-]{1,39}$/.test(options.actor))
    )
      throw new BadRequestException("Invalid Insights filters");
    const repository = await this.access.requireRepository(
      session,
      repositoryId,
      "policy.read",
    );
    // Verify this ruleset is actually accessible from the selected repository.
    await this.provider.getRepositoryRuleset(
      repository.installationId,
      repository.githubId,
      id,
    );
    const result =
      options.source === "retained"
        ? await this.history!.read(
            repository.id,
            repository.githubId,
            id,
            repository.fullName,
            options,
          )
        : await this.provider.readRulesetInsights(
            repository.installationId,
            repository.githubId,
            id,
            options,
          );
    if (this.history) {
      await this.access.requireRepository(session, repositoryId, 'assessment.read');
      const suites = await this.history.linkAssessments(repository.id, result.suites);
      await this.access.requireRepository(session, repositoryId, 'assessment.read');
      await this.access.requireRepository(session, repositoryId, 'policy.read');
      return { ...result, suites };
    }
    await this.access.requireRepository(session, repositoryId, "policy.read");
    return result;
  }
  async detail(
    session: AuthenticatedSession,
    repositoryId: string,
    id: number,
  ) {
    if (!Number.isSafeInteger(id) || id < 1)
      throw new BadRequestException("Invalid ruleset ID");
    const repository = await this.access.requireRepository(
      session,
      repositoryId,
      "policy.read",
    );
    const result = await this.provider.getRepositoryRuleset(
      repository.installationId,
      repository.githubId,
      id,
    );
    await this.access.requireRepository(session, repositoryId, "policy.read");
    return result;
  }
}
