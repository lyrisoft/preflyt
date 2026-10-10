import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  randomBytes,
} from "node:crypto";
import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service.js";
import {
  configurationFields,
  configurationKeys,
} from "./configuration-catalogue.js";
import { applyConfiguration } from "./runtime-configuration.js";
const aad = Buffer.from("preflyt.deployment-configuration.v1:primary");
function key() {
  const text = process.env.CONFIGURATION_ENCRYPTION_KEY ?? "";
  const value = Buffer.from(text, "base64");
  if (
    value.length !== 32 ||
    value.toString("base64") !== text ||
    [
      process.env.GITHUB_USER_TOKEN_ENCRYPTION_KEY,
      process.env.AI_PROVIDER_ENCRYPTION_KEY,
    ].includes(text)
  )
    throw new ServiceUnavailableException(
      "Configure a separate base64-encoded 32-byte CONFIGURATION_ENCRYPTION_KEY in deployment secrets",
    );
  return value;
}
export function encryptConfigurationSecrets(values: Record<string, string>) {
  if (!Object.values(values).some(Boolean)) return null;
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(aad);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(values)),
    cipher.final(),
  ]);
  return [
    "v1",
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}
export function decryptConfigurationSecrets(envelope: string | null) {
  if (!envelope) return {} as Record<string, string>;
  try {
    if (envelope.length > 200000) throw new Error();
    const parts = envelope.split(".");
    if (
      parts.length !== 4 ||
      parts[0] !== "v1" ||
      parts.slice(1).some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
    )
      throw new Error();
    const nonce = Buffer.from(parts[1]!, "base64url"),
      tag = Buffer.from(parts[2]!, "base64url");
    if (nonce.length !== 12 || tag.length !== 16) throw new Error();
    const cipher = createDecipheriv("aes-256-gcm", key(), nonce);
    cipher.setAAD(aad);
    cipher.setAuthTag(tag);
    const values = JSON.parse(
      Buffer.concat([
        cipher.update(Buffer.from(parts[3]!, "base64url")),
        cipher.final(),
      ]).toString("utf8"),
    );
    if (
      !values ||
      typeof values !== "object" ||
      Array.isArray(values) ||
      Object.entries(values).some(
        ([name, value]) =>
          !configurationFields.some(
            (field) => field.key === name && field.kind === "secret",
          ) || typeof value !== "string",
      )
    )
      throw new Error();
    return values as Record<string, string>;
  } catch {
    throw new ServiceUnavailableException(
      "Stored configuration secrets could not be decrypted; check the deployment encryption key",
    );
  }
}
export function validateConfiguration(
  values: Record<string, unknown>,
  complete = false,
): Record<string, string> {
  if (
    Object.keys(values).length > configurationFields.length ||
    Object.keys(values).some((name) => !configurationKeys.has(name))
  )
    throw new BadRequestException("Unknown configuration field");
  const result: Record<string, string> = {};
  for (const [name, raw] of Object.entries(values)) {
    const field = configurationFields.find((field) => field.key === name)!;
    if (
      typeof raw !== "string" ||
      raw.length > (field.kind === "secret" ? 16384 : 2048) ||
      raw.includes("\0")
    )
      throw new BadRequestException("Invalid " + field.label);
    const value = field.kind === "secret" ? raw : raw.trim();
    if (field.kind === "boolean" && !["true", "false"].includes(value))
      throw new BadRequestException("Invalid " + field.label);
    if (field.kind === "number" && value && !/^[1-9]\d{0,15}$/.test(value))
      throw new BadRequestException("Invalid " + field.label);
    if (name === "SMTP_PORT" && value && Number(value) > 65535)
      throw new BadRequestException("Invalid SMTP port");
    if (
      name === "RULESET_INSIGHTS_RETENTION_DAYS" &&
      (!value || Number(value) < 1 || Number(value) > 365)
    )
      throw new BadRequestException(
        "History retention must be between 1 and 365 days",
      );
    if (field.kind === "url" && value) {
      try {
        const url = new URL(value);
        if (
          url.username ||
          url.password ||
          url.hash ||
          url.search ||
          !(
            url.protocol === "https:" ||
            (process.env.NODE_ENV !== "production" &&
              url.protocol === "http:" &&
              ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
          )
        )
          throw new Error();
      } catch {
        throw new BadRequestException(
          "Invalid " + field.label + "; use HTTPS or a local development URL",
        );
      }
    }
    if (name.endsWith("PRIVATE_KEY") && value) {
      try {
        if (
          createPrivateKey(value.replace(/\\n/g, "\n")).asymmetricKeyType !==
          "rsa"
        )
          throw new Error();
      } catch {
        throw new BadRequestException("Use a valid RSA PEM " + field.label);
      }
    }
    if (name === "SMTP_HOST" && value && !/^[a-zA-Z0-9.-]{1,253}$/.test(value))
      throw new BadRequestException("Invalid SMTP host");
    if (
      name === "SMTP_FROM" &&
      value &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    )
      throw new BadRequestException("Invalid sender email");
    result[name] = value;
  }
  if (complete) {
    const require = (names: string[], label: string) => {
      if (names.some((name) => !result[name]))
        throw new BadRequestException(
          "Configure " + label + " before enabling it",
        );
    };
    const requireKey = (name: string) => {
      const encoded = process.env[name] ?? "";
      const decoded = Buffer.from(encoded, "base64");
      if (decoded.length !== 32 || decoded.toString("base64") !== encoded)
        throw new BadRequestException(
          "Configure a valid base64-encoded 32-byte " +
            name +
            " in deployment secrets first",
        );
    };
    if (result.GITHUB_CHECK_PUBLICATION_ENABLED === "true")
      require([
        "GITHUB_APP_ID",
        "GITHUB_APP_PRIVATE_KEY",
      ], "the GitHub check publication connection");
    const oidc = [
      "OIDC_ISSUER",
      "OIDC_CLIENT_ID",
      "OIDC_CLIENT_SECRET",
      "OIDC_REDIRECT_URI",
    ];
    if (oidc.some((name) => result[name]))
      require(oidc, "all single sign-on fields");
    if (result.GITHUB_LOGIN_ENABLED === "true") {
      require([
        "GITHUB_APP_ID",
        "GITHUB_APP_CLIENT_ID",
        "GITHUB_APP_CLIENT_SECRET",
        "GITHUB_APP_PRIVATE_KEY",
        "GITHUB_LOGIN_CALLBACK_URL",
      ], "the GitHub login connection");
      requireKey("GITHUB_USER_TOKEN_ENCRYPTION_KEY");
    }
    if (result.GITHUB_EVENTS_ENABLED === "true") {
      require(["GITHUB_WEBHOOK_SECRET"], "the webhook secret");
      if (result.GITHUB_WEBHOOK_SECRET!.length < 32)
        throw new BadRequestException(
          "Use a webhook secret of at least 32 characters",
        );
      if (!process.env.QUEUE_REDIS_URL)
        throw new BadRequestException(
          "Configure the persistent queue connection first",
        );
    }
    if (result.NOTIFICATION_EMAIL_ENABLED === "true") {
      require(["SMTP_HOST", "SMTP_PORT", "SMTP_FROM"], "SMTP");
      if (result.NOTIFICATIONS_ENABLED !== "true")
        throw new BadRequestException(
          "Enable workspace notifications before email notifications",
        );
    }
    if (
      result.AUTOMATIC_CHECK_PUBLICATION_ENABLED === "true" &&
      result.GITHUB_CHECK_PUBLICATION_ENABLED !== "true"
    )
      throw new BadRequestException(
        "Enable PR check publication before automatic checks",
      );
    if (
      result.AI_REVIEWS_ENABLED === "true" &&
      result.AI_CONFIGURATION_ENABLED !== "true"
    )
      throw new BadRequestException(
        "Enable AI model configuration before AI reviews",
      );
    if (result.AI_CONFIGURATION_ENABLED === "true")
      requireKey("AI_PROVIDER_ENCRYPTION_KEY");
    if (
      result.GITHUB_RULESET_ACTIVATION_ENABLED === "true" &&
      process.env.GITHUB_GOVERNANCE_LOCAL_ACCEPTANCE !== "true"
    ) {
      require([
        "GITHUB_GOVERNANCE_APP_ID",
        "GITHUB_GOVERNANCE_PRIVATE_KEY",
        "GITHUB_GOVERNANCE_INSTALLATION_ID",
      ], "the separate governance connection");
      if (result.GITHUB_GOVERNANCE_APP_ID === result.GITHUB_APP_ID)
        throw new BadRequestException(
          "Governance requires a separate GitHub App",
        );
    }
  }
  return result;
}
export function unpackConfiguration(row: {
  values: unknown;
  encryptedSecrets: string | null;
}) {
  return validateConfiguration({
    ...(row.values as Record<string, string>),
    ...decryptConfigurationSecrets(row.encryptedSecrets),
  });
}
export async function initializeConfiguration(db: PrismaService) {
  let row = await db.deploymentConfiguration.findUnique({
    where: { id: "primary" },
  });
  if (!row) {
    const imported = validateConfiguration(
      Object.fromEntries(
        configurationFields.map((field) => [
          field.key,
          process.env[field.key] || field.defaultValue,
        ]),
      ),
    );
    const values = Object.fromEntries(
      configurationFields
        .filter((field) => field.kind !== "secret")
        .map((field) => [field.key, imported[field.key]!]),
    );
    const secrets = Object.fromEntries(
      configurationFields
        .filter((field) => field.kind === "secret")
        .map((field) => [field.key, imported[field.key]!]),
    );
    row = await db.deploymentConfiguration.upsert({
      where: { id: "primary" },
      update: {},
      create: {
        id: "primary",
        values,
        encryptedSecrets: encryptConfigurationSecrets(secrets),
      },
    });
  }
  return row;
}
export function watchConfiguration(db: PrismaService) {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void db.deploymentConfiguration
      .findUnique({ where: { id: "primary" } })
      .then((row) => {
        if (!row) throw new Error();
        applyConfiguration(unpackConfiguration(row));
      })
      .catch(() => {
        // Existing snapshot is never replaced with environment values on a database/key failure.
        // Fail closed for live capability switches until a successful database read.
        const disabled = Object.fromEntries(
          configurationFields
            .filter((field) => !field.restart)
            .map((field) => [
              field.key,
              field.kind === "boolean" ? "false" : field.defaultValue,
            ]),
        );
        applyConfiguration(disabled);
      })
      .finally(() => {
        running = false;
      });
  }, 5000);
  timer.unref();
  return () => clearInterval(timer);
}
