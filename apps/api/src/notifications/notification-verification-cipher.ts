import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { configurationEncryptionKey } from "../configuration/configuration-store.js";

type Context = {
  id: string;
  identityId: string;
  organizationId: string;
  tokenHash: string;
};
const aad = (context: Context) =>
  Buffer.from(
    JSON.stringify([
      "preflyt.notification-email-verification.v1",
      context.id,
      context.identityId,
      context.organizationId,
      context.tokenHash,
    ]),
  );

/** Separate authenticated context from deployment settings using the deployment master key. */
export function encryptVerificationCode(context: Context, code: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    configurationEncryptionKey(),
    nonce,
  );
  cipher.setAAD(aad(context));
  const encrypted = Buffer.concat([
    cipher.update(code, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptVerificationCode(context: Context, envelope: string) {
  const parts = envelope.split(".");
  if (
    envelope.length > 200 ||
    parts.length !== 4 ||
    parts[0] !== "v1" ||
    parts.slice(1).some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
  )
    throw new Error("INVALID_VERIFICATION_PAYLOAD");
  const nonce = Buffer.from(parts[1]!, "base64url"),
    tag = Buffer.from(parts[2]!, "base64url");
  if (nonce.length !== 12 || tag.length !== 16)
    throw new Error("INVALID_VERIFICATION_PAYLOAD");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    configurationEncryptionKey(),
    nonce,
    { authTagLength: 16 },
  );
  decipher.setAAD(aad(context));
  decipher.setAuthTag(tag);
  const code = Buffer.concat([
    decipher.update(Buffer.from(parts[3]!, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  if (!/^\d{8}$/.test(code)) throw new Error("INVALID_VERIFICATION_PAYLOAD");
  return code;
}
