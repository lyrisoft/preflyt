import {
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { GitHubIdentityProvider } from "./github-identity-provider.js";
import type { GitHubUserCredential } from "../generated/prisma/client.js";
import {
  decryptGitHubUserTokens,
  encryptGitHubUserTokens,
} from "./github-token-cipher.js";

// Rotation consumes the previous refresh token. The credential row lock serializes
// API and worker processes and concurrent sign-ins/revocations without a Redis lock.
export class GitHubCredentialService {
  constructor(
    private readonly db: PrismaService,
    private readonly provider: GitHubIdentityProvider,
  ) {}
  async access(accountId: string, known?: GitHubUserCredential | null) {
    const credential =
      known === undefined
        ? await this.db.gitHubUserCredential.findUnique({
            where: { accountId },
          })
        : known;
    if (!credential)
      throw new ForbiddenException(
        "GitHub authorization has expired or was revoked. Sign in with GitHub again.",
      );
    if (credential.accessExpiresAt.getTime() > Date.now() + 60000)
      return {
        token: decryptGitHubUserTokens(accountId, credential.encryptedTokens)
          .accessToken,
        expiresAt: credential.accessExpiresAt,
      };
    const result = await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "accountId" FROM "GitHubUserCredential" WHERE "accountId" = ${accountId} FOR UPDATE`;
        const current = await tx.gitHubUserCredential.findUnique({
          where: { accountId },
        });
        if (!current) return null;
        if (current.accessExpiresAt.getTime() > Date.now() + 60000)
          return {
            token: decryptGitHubUserTokens(accountId, current.encryptedTokens)
              .accessToken,
            expiresAt: current.accessExpiresAt,
          };
        const invalidate = async () => {
          await tx.gitHubUserAccessEvidence.deleteMany({
            where: { accountId },
          });
          await tx.gitHubUserCredential.deleteMany({ where: { accountId } });
          await tx.auditEvent.create({
            data: {
              event: "github.user_authorization_expired",
              actorId: null,
              metadata: { accountId },
            },
          });
          return null;
        };
        if (current.refreshExpiresAt.getTime() <= Date.now())
          return invalidate();
        try {
          const rotated = await this.provider.refresh(
            decryptGitHubUserTokens(accountId, current.encryptedTokens)
              .refreshToken,
          );
          await tx.gitHubUserCredential.update({
            where: { accountId },
            data: {
              encryptedTokens: encryptGitHubUserTokens(accountId, {
                accessToken: rotated.accessToken,
                refreshToken: rotated.refreshToken,
              }),
              accessExpiresAt: rotated.accessExpiresAt,
              refreshExpiresAt: rotated.refreshExpiresAt,
            },
          });
          await tx.gitHubUserAccessEvidence.deleteMany({
            where: { accountId },
          });
          await tx.auditEvent.create({
            data: {
              event: "github.user_token_refreshed",
              actorId: null,
              metadata: { accountId },
            },
          });
          return {
            token: rotated.accessToken,
            expiresAt: rotated.accessExpiresAt,
          };
        } catch (error) {
          if (error instanceof ForbiddenException) return invalidate();
          throw new ServiceUnavailableException(
            "GitHub token refresh is temporarily unavailable. Try again. Your workspace session is unchanged.",
          );
        }
      },
      { timeout: 20000, maxWait: 5000 },
    );
    if (!result)
      throw new ForbiddenException(
        "GitHub authorization has expired or was revoked. Sign in with GitHub again.",
      );
    return result;
  }
}
