import { createHash, randomBytes } from "node:crypto";
import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  ConflictException,
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { GitHubIdentityProvider } from "../auth/github-identity-provider.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { GitHubProviderService } from "./github-provider.service.js";
import { configurationValue } from "../configuration/runtime-configuration.js";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const opaque = () => randomBytes(32).toString("base64url");
const state = () => `connection_${opaque()}`;
const ttl = 10 * 60 * 1000;

@Injectable()
export class GitHubConnectionService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(GitHubProviderService) private readonly app: GitHubProviderService,
    @Inject(GitHubIdentityProvider)
    private readonly identity: GitHubIdentityProvider,
  ) {}

  get sessionCookieName() {
    return this.auth.sessionCookieName;
  }
  get cookieName() {
    return this.auth.secureCookie
      ? "__Host-preflyt.github-connection"
      : "preflyt.github-connection";
  }
  get secureCookie() {
    return this.auth.secureCookie;
  }

  async begin(token: string | undefined) {
    const session = await this.auth.currentSession(token);
    if (!token || !session.authenticated)
      throw new UnauthorizedException("Sign in before connecting GitHub");
    if (session.organizationId) {
      if (!session.permissions.includes("repository.connect"))
        throw new ForbiddenException(
          "Workspace connection permission is required",
        );
    } else if (!session.platformAdmin)
      throw new ForbiddenException(
        "A Super Admin must connect the first workspace",
      );
    const rawState = state(),
      binding = opaque();
    const appId = configurationValue("GITHUB_APP_ID");
    if (!appId)
      throw new ForbiddenException("Configure the deployment GitHub App first");
    // Resolve the configured App before saving any connection state.
    const url = await this.app.createInstallationUrl(rawState);
    await this.db.$transaction(async (tx) => {
      await tx.gitHubConnectionTransaction.deleteMany({
        where: {
          OR: [
            { expiresAt: { lte: new Date() } },
            { sessionHash: hash(token) },
          ],
        },
      });
      await tx.gitHubConnectionTransaction.create({
        data: {
          stateHash: hash(rawState),
          bindingHash: hash(binding),
          sessionHash: hash(token),
          actorId: session.identityId,
          appId,
          organizationId: session.organizationId,
          expiresAt: new Date(Date.now() + ttl),
        },
      });
    });
    return { url, binding };
  }

  private async pending(
    rawState: string,
    binding: string | undefined,
    token: string | undefined,
    phase: string,
  ) {
    if (!/^connection_[A-Za-z0-9_-]{43}$/.test(rawState) || !binding || !token)
      throw new UnauthorizedException(
        "GitHub connection expired. Start again.",
      );
    const row = await this.db.gitHubConnectionTransaction.findUnique({
      where: { stateHash: hash(rawState) },
    });
    const session = await this.auth.currentSession(token);
    if (
      !row ||
      row.appId !== configurationValue("GITHUB_APP_ID") ||
      row.expiresAt <= new Date() ||
      row.phase !== phase ||
      row.bindingHash !== hash(binding) ||
      row.sessionHash !== hash(token) ||
      !session.authenticated ||
      session.identityId !== row.actorId ||
      (session.organizationId ?? null) !== row.organizationId
    )
      throw new UnauthorizedException(
        "GitHub connection belongs to another or expired session. Start again.",
      );
    if (
      row.organizationId
        ? !session.permissions.includes("repository.connect")
        : !session.platformAdmin
    )
      throw new ForbiddenException("GitHub connection permission was revoked");
    return row;
  }

  async installed(
    rawState: string,
    binding: string | undefined,
    token: string | undefined,
    rawInstallationId: string,
    action: string,
  ) {
    const row = await this.pending(rawState, binding, token, "INSTALLATION");
    if (
      !["install", "update"].includes(action) ||
      !/^[1-9]\d{0,15}$/.test(rawInstallationId)
    )
      throw new ForbiddenException("Invalid GitHub installation callback");
    const installation = await this.app.verifyInstallation(
      BigInt(rawInstallationId),
    );
    if (installation.accountType !== "Organization")
      throw new ForbiddenException("Install the App in a GitHub organization");
    const next = state(),
      verifier = opaque();
    const changed = await this.db.gitHubConnectionTransaction.updateMany({
      where: {
        id: row.id,
        stateHash: row.stateHash,
        phase: "INSTALLATION",
        expiresAt: { gt: new Date() },
      },
      data: {
        stateHash: hash(next),
        phase: "USER_AUTHORIZATION",
        installationId: installation.id,
        codeVerifier: verifier,
      },
    });
    if (changed.count !== 1)
      throw new UnauthorizedException(
        "GitHub installation callback was already used",
      );
    return this.app.createUserAuthorizationUrl(
      next,
      createHash("sha256").update(verifier).digest("base64url"),
    );
  }

  async complete(
    rawState: string,
    binding: string | undefined,
    token: string | undefined,
    code: string,
  ) {
    const row = await this.pending(
      rawState,
      binding,
      token,
      "USER_AUTHORIZATION",
    );
    if (
      !row.installationId ||
      !row.codeVerifier ||
      !/^[A-Za-z0-9_-]{1,512}$/.test(code)
    )
      throw new ForbiddenException("Invalid GitHub authorization callback");
    const prior = await this.db.gitHubInstallation.findUnique({
      where: { id: row.installationId },
      select: { accessRevision: true },
    });
    const userToken = await this.app.exchangeUserCode(code, row.codeVerifier);
    let verified: Awaited<ReturnType<GitHubIdentityProvider["verify"]>>;
    let githubUser: Awaited<ReturnType<GitHubIdentityProvider["user"]>>;
    try {
      githubUser = await this.identity.user(userToken);
      verified = await this.identity.verify(
        userToken,
        row.installationId,
        githubUser.id,
      );
      if (!verified.owner)
        throw new ForbiddenException(
          "A GitHub organization owner must confirm this connection",
        );
    } finally {
      await this.app.revokeUserToken(userToken);
    }
    const repositories = await this.app.listInstallationRepositories(
      row.installationId,
    );
    const visible = new Set(verified.repositoryIds.map(String));
    if (
      repositories.some(
        (repo) =>
          !visible.has(String(repo.id)) ||
          repo.ownerLogin.toLowerCase() !== verified.login.toLowerCase(),
      )
    )
      throw new ForbiddenException(
        "GitHub repository access changed. Start again.",
      );

    const result = await this.db.$transaction(
      async (tx) => {
        if (row.appId !== configurationValue("GITHUB_APP_ID"))
          throw new ConflictException(
            "The configured GitHub App changed. Start again.",
          );
        const session = await tx.webSession.findFirst({
          where: {
            tokenHash: row.sessionHash,
            identityId: row.actorId,
            expiresAt: { gt: new Date() },
          },
          include: { identity: { include: { membership: true } } },
        });
        if (
          !session?.identity.membership?.active ||
          (row.organizationId
            ? session.activeOrganizationId &&
              session.activeOrganizationId !== row.organizationId
            : session.activeOrganizationId)
        )
          throw new UnauthorizedException(
            "The initiating admin session is no longer active",
          );
        const existing = await tx.gitHubInstallation.findUnique({
          where: { id: row.installationId! },
        });
        if (existing?.accessRevision !== prior?.accessRevision)
          throw new ConflictException(
            "Installation access changed. Start again.",
          );
        const link = await tx.gitHubOrganizationLink.findUnique({
          where: {
            host_githubOrganizationId: {
              host: "github.com",
              githubOrganizationId: verified.organizationId,
            },
          },
        });
        if (existing && link && existing.organizationId !== link.organizationId)
          throw new ConflictException(
            "Installation and workspace do not match",
          );
        let organizationId =
          row.organizationId ??
          link?.organizationId ??
          existing?.organizationId;
        if (
          (link && organizationId !== link.organizationId) ||
          (existing && organizationId !== existing.organizationId)
        )
          throw new ForbiddenException(
            "This installation belongs to another workspace",
          );
        if (organizationId) {
          const member = await tx.organizationMembership.findUnique({
            where: {
              organizationId_identityId: {
                organizationId,
                identityId: row.actorId,
              },
            },
          });
          if (!member?.active || !["OWNER", "ADMIN", "ENGINEERING_LEAD"].includes(member.role))
            throw new ForbiddenException(
              "An existing workspace admin or Engineering Lead must connect this installation",
            );
        } else {
          if (session.identity.membership.role !== "SUPER_ADMIN")
            throw new ForbiddenException("Super Admin access was revoked");
          organizationId = (
            await tx.organization.create({ data: { name: verified.login } })
          ).id;
          await tx.organizationMembership.create({
            data: { identityId: row.actorId, organizationId, role: "OWNER" },
          });
        }
        const workspaceLink = await tx.gitHubOrganizationLink.findUnique({
          where: { organizationId },
        });
        if (
          workspaceLink &&
          workspaceLink.githubOrganizationId !== verified.organizationId
        )
          throw new ForbiddenException(
            "The workspace is already linked to another GitHub organization",
          );
        await tx.gitHubOrganizationLink.upsert({
          where: {
            host_githubOrganizationId: {
              host: "github.com",
              githubOrganizationId: verified.organizationId,
            },
          },
          create: {
            host: "github.com",
            githubOrganizationId: verified.organizationId,
            organizationId,
            login: verified.login,
            verifiedAt: new Date(),
          },
          update: { login: verified.login, verifiedAt: new Date() },
        });
        const installation = verified.installation;
        const metadata = {
          accountLogin: verified.login,
          accountType: "Organization",
          repositoryTracking: "INSTALLATION",
          repositorySelection: installation.repositorySelection,
          permissions: installation.permissions,
          connectedById: row.actorId,
          active: true,
          lastVerifiedAt: new Date(),
          syncState: "OK",
          lastSyncAttemptAt: new Date(),
        };
        await tx.gitHubInstallation.upsert({
          where: { id: installation.id },
          create: { id: installation.id, organizationId, ...metadata },
          update: {
            ...metadata,
            accessRevision: { increment: 1 },
            syncLeaseUntil: null,
          },
        });
        for (const repo of repositories) {
          const current = await tx.gitHubRepository.findUnique({
            where: { githubId: repo.id },
            select: { installationId: true },
          });
          if (current && current.installationId !== installation.id)
            throw new ForbiddenException(
              "A repository belongs to another installation",
            );
          const data = {
            name: repo.name,
            fullName: repo.fullName,
            ownerLogin: repo.ownerLogin,
            defaultBranch: repo.defaultBranch,
            isPrivate: repo.isPrivate,
            available: true,
          };
          // New imports follow the GitHub installation selection. Explicit local exclusions survive reconnects.
          await tx.gitHubRepository.upsert({
            where: { githubId: repo.id },
            create: {
              ...data,
              githubId: repo.id,
              installationId: installation.id,
              selected: true,
            },
            update: data,
          });
        }
        await tx.gitHubRepository.updateMany({
          where: {
            installationId: installation.id,
            githubId: { notIn: repositories.map((repo) => repo.id) },
          },
          data: { available: false, selected: false },
        });
        // Consume the one-time flow and select the workspace atomically with import.
        const consumed = await tx.gitHubConnectionTransaction.deleteMany({
          where: {
            id: row.id,
            stateHash: row.stateHash,
            phase: "USER_AUTHORIZATION",
            expiresAt: { gt: new Date() },
          },
        });
        if (consumed.count !== 1)
          throw new UnauthorizedException(
            "GitHub connection callback was already used",
          );
        await tx.webSession.update({
          where: { id: session.id },
          data: { activeOrganizationId: organizationId },
        });
        await tx.auditEvent.create({
          data: {
            event: "github_installation_connected",
            actorId: row.actorId,
            metadata: {
              organizationId,
              installationId: installation.id.toString(),
              repositoryCount: repositories.length,
              verifiedGithubUserId: githubUser.id.toString(),
              preservedSession: true,
            },
          },
        });
        return {
          accountLogin: verified.login,
          repositoryCount: repositories.length,
        };
      },
      { isolationLevel: "Serializable", timeout: 30000 },
    );
    return result;
  }
}
