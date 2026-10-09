import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { digest } from "../assessments/assessment-digest.js";
export const aiConfigurationEnabled = () =>
  process.env.AI_CONFIGURATION_ENABLED === "true";
export const aiStages = [
  "laptop",
  "repository",
  "pull_request",
  "qa",
  "performance",
  "production",
] as const;
export type AiEndpoint = {
  id: string;
  name: string;
  baseUrl: string;
  locality: "local" | "hosted";
  requiresKey: boolean;
  models: string[];
};
export function aiCredentialKey() {
  const encoded = process.env.AI_PROVIDER_ENCRYPTION_KEY;
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded))
    throw new Error(
      "AI_PROVIDER_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded)
    throw new Error(
      "AI_PROVIDER_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  return key;
}
export function aiEndpoints(): AiEndpoint[] {
  try {
    const items: unknown = JSON.parse(
      process.env.AI_APPROVED_ENDPOINTS ?? "[]",
    );
    if (!Array.isArray(items) || items.length > 32) throw new Error();
    const ids = new Set<string>();
    return items.map((item: unknown) => {
      if (!item || typeof item !== "object") throw new Error();
      const value = item as Record<string, unknown>;
      if (
        Object.keys(value).sort().join(",") !==
          "baseUrl,id,locality,models,name,requiresKey" ||
        typeof value.id !== "string" ||
        !/^[a-z][a-z0-9-]{0,63}$/.test(value.id) ||
        ids.has(value.id) ||
        typeof value.name !== "string" ||
        !value.name.trim() ||
        value.name.length > 120 ||
        !["local", "hosted"].includes(String(value.locality)) ||
        typeof value.requiresKey !== "boolean" ||
        typeof value.baseUrl !== "string" ||
        !Array.isArray(value.models) ||
        !value.models.length ||
        value.models.length > 100 ||
        value.models.some(
          (m) =>
            typeof m !== "string" ||
            !/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,255}$/.test(m),
        ) ||
        new Set(value.models).size !== value.models.length
      )
        throw new Error();
      const url = new URL(value.baseUrl);
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !["http:", "https:"].includes(url.protocol) ||
        (value.locality === "hosted" && url.protocol !== "https:")
      )
        throw new Error();
      ids.add(value.id);
      return { ...value, baseUrl: url.href.replace(/\/$/, "") } as AiEndpoint;
    });
  } catch {
    throw new Error(
      "AI_APPROVED_ENDPOINTS must contain valid reviewed endpoint definitions",
    );
  }
}
export const endpointDigest = (endpoint: AiEndpoint) => digest(endpoint);
export const aiCredentialEndpointDigest = (endpoint: AiEndpoint) =>
  digest({
    id: endpoint.id,
    baseUrl: endpoint.baseUrl,
    locality: endpoint.locality,
    requiresKey: endpoint.requiresKey,
  });
const aad = (org: string, id: string, endpointHash: string) =>
  Buffer.from(
    JSON.stringify(["preflyt:ai-credential:v1", org, id, endpointHash]),
  );
export function encryptAiCredential(
  org: string,
  id: string,
  value: string,
  endpointHash: string,
) {
  if (
    !/^[a-f0-9]{64}$/.test(endpointHash) ||
    !value ||
    Buffer.byteLength(value) > 4096 ||
    /[\s\u0000-\u001f\u007f]/.test(value)
  )
    throw new Error("Enter a valid provider key");
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", aiCredentialKey(), nonce);
  cipher.setAAD(aad(org, id, endpointHash));
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function decryptAiCredential(
  org: string,
  id: string,
  envelope: string,
  endpointHash: string,
) {
  try {
    const parts = envelope.split(".");
    if (
      !/^[a-f0-9]{64}$/.test(endpointHash) ||
      envelope.length > 6000 ||
      parts.length !== 4 ||
      parts[0] !== "v1" ||
      parts.slice(1).some((p) => !/^[A-Za-z0-9_-]+$/.test(p))
    )
      throw new Error();
    const nonce = Buffer.from(parts[1]!, "base64url"),
      tag = Buffer.from(parts[2]!, "base64url");
    if (
      nonce.length !== 12 ||
      tag.length !== 16 ||
      nonce.toString("base64url") !== parts[1] ||
      tag.toString("base64url") !== parts[2] ||
      Buffer.from(parts[3]!, "base64url").toString("base64url") !== parts[3]
    )
      throw new Error();
    const cipher = createDecipheriv("aes-256-gcm", aiCredentialKey(), nonce);
    cipher.setAAD(aad(org, id, endpointHash));
    cipher.setAuthTag(tag);
    return Buffer.concat([
      cipher.update(Buffer.from(parts[3]!, "base64url")),
      cipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("AI provider credentials could not be decrypted");
  }
}
/** Only metadata is sent. Redirects, unbounded bodies and response details are rejected. */
export async function testAiEndpoint(
  endpoint: AiEndpoint,
  modelId: string,
  key?: string,
) {
  const signal = AbortSignal.timeout(10000);
  const response = await fetch(endpoint.baseUrl + "/models", {
    headers: {
      accept: "application/json",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    redirect: "error",
    signal,
  });
  if (!response.ok || !response.body)
    return response.status === 401 || response.status === 403
      ? "AUTH_REJECTED"
      : "UNAVAILABLE";
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1048576) throw new Error("Response limit");
      chunks.push(part.value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const data = (value as { data?: unknown })?.data;
    if (!Array.isArray(data) || data.length > 10000) return "UNAVAILABLE";
    return data.some(
      (item) => item && typeof item === "object" && item.id === modelId,
    )
      ? "CONNECTED"
      : "MODEL_UNAVAILABLE";
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
