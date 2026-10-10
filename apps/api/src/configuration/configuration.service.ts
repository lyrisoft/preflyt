import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { configurationFields } from "./configuration-catalogue.js";
import {
  applyConfiguration,
  configurationNeedsRestart,
} from "./runtime-configuration.js";
import {
  initializeConfiguration,
  unpackConfiguration,
  validateConfiguration,
  encryptConfigurationSecrets,
  watchConfiguration,
} from "./configuration-store.js";
@Injectable()
export class ConfigurationService implements OnModuleInit, OnModuleDestroy {
  private stop?: () => void;
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  onModuleInit() {
    if (process.env.NODE_ENV !== "test")
      this.stop = watchConfiguration(this.db);
  }
  onModuleDestroy() {
    this.stop?.();
  }
  private authorize(session: AuthenticatedSession) {
    if (session.platformAdmin !== true)
      throw new ForbiddenException(
        "Only a Super Admin can manage deployment configuration",
      );
  }
  async get(session: AuthenticatedSession) {
    this.authorize(session);
    const row = await initializeConfiguration(this.db),
      values = unpackConfiguration(row);
    return {
      revision: row.revision,
      updatedAt: row.updatedAt,
      restartRequired: configurationNeedsRestart(values),
      fields: configurationFields.map((field) => ({
        ...field,
        value:
          field.kind === "secret"
            ? ""
            : (values[field.key] ?? field.defaultValue),
        configured: Boolean(values[field.key]),
      })),
      deploymentOnly: [
        "DATABASE_URL",
        "REDIS_URL",
        "QUEUE_REDIS_URL",
        "WEB_ORIGIN",
        "CONFIGURATION_ENCRYPTION_KEY",
        "GITHUB_USER_TOKEN_ENCRYPTION_KEY",
        "AI_PROVIDER_ENCRYPTION_KEY",
        "SUPER_ADMIN_USERNAME",
        "SUPER_ADMIN_PASSWORD",
        "NATIVE_RUNTIME_APPROVAL",
        "NATIVE_RUNTIME_REVIEW_KEYS",
        "NATIVE_TOOL_REVIEWS",
        "CI_ATTESTATION_*",
        "CI_EXECUTION_CONTRACTS",
        "CI_ORGANIZATION_SIGNER_KEYS",
        "OTEL_*",
      ],
    };
  }
  async save(
    session: AuthenticatedSession,
    revision: number,
    patch: Record<string, unknown>,
    clearSecrets: string[],
  ) {
    this.authorize(session);
    const updates = validateConfiguration(patch);
    if (
      clearSecrets.some(
        (name) =>
          !configurationFields.some(
            (field) => field.key === name && field.kind === "secret",
          ),
      )
    )
      throw new ForbiddenException(
        "Only configured secret fields can be cleared",
      );
    const row = await initializeConfiguration(this.db);
    if (row.revision !== revision)
      throw new ConflictException(
        "Configuration changed. Refresh before saving.",
      );
    const previous = unpackConfiguration(row);
    const next = {
      ...previous,
      ...Object.fromEntries(
        Object.entries(updates).filter(
          ([name, value]) =>
            value ||
            !configurationFields.some(
              (field) => field.key === name && field.kind === "secret",
            ),
        ),
      ),
    };
    for (const name of clearSecrets) {
      if (updates[name])
        throw new ConflictException(
          "Choose either replace or clear for a secret",
        );
      next[name] = "";
    }
    validateConfiguration(next, true);
    const changed = configurationFields
      .filter((field) => next[field.key] !== previous[field.key])
      .map((field) => field.key);
    if (!changed.length)
      return { saved: true, restartRequired: configurationNeedsRestart(next) };
    const values = Object.fromEntries(
      configurationFields
        .filter((field) => field.kind !== "secret")
        .map((field) => [field.key, next[field.key] ?? field.defaultValue]),
    );
    const secrets = Object.fromEntries(
      configurationFields
        .filter((field) => field.kind === "secret")
        .map((field) => [field.key, next[field.key] ?? ""]),
    );
    await this.db.$transaction(async (tx) => {
      const result = await tx.deploymentConfiguration.updateMany({
        where: { id: "primary", revision },
        data: {
          values,
          encryptedSecrets: encryptConfigurationSecrets(secrets),
          revision: { increment: 1 },
          updatedById: session.identityId,
        },
      });
      if (result.count !== 1)
        throw new ConflictException(
          "Configuration changed. Refresh before saving.",
        );
      await tx.auditEvent.create({
        data: {
          event: "deployment.configuration.updated",
          actorId: session.identityId,
          metadata: {
            scope: "deployment",
            fields: changed,
            revision: revision + 1,
          },
        },
      });
    });
    if (process.env.NODE_ENV !== "test") applyConfiguration(next);
    return { saved: true, restartRequired: configurationNeedsRestart(next) };
  }
}
