import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { aiHttpRequest, allowedAiAddress } from "./ai-http.js";
import { isIP } from "node:net";
import { digest } from "../assessments/assessment-digest.js";
export const aiConfigurationEnabled = () =>
  process.env.AI_CONFIGURATION_ENABLED === "true";
export const aiReviewsEnabled = () => aiConfigurationEnabled() && process.env.AI_REVIEWS_ENABLED === "true";
export const aiStages = [
  "laptop",
  "repository",
  "pull_request",
  "qa",
  "performance",
  "production",
] as const;
export const aiProviderPresets = [
  { id: "openai", name: "OpenAI (ChatGPT)", baseUrl: "https://api.openai.com/v1", exampleModel: "gpt-4.1" },
  { id: "anthropic", name: "Anthropic (Claude)", baseUrl: "https://api.anthropic.com/v1", exampleModel: "claude-opus-5" },
  { id: "gemini", name: "Google (Gemini)", baseUrl: "https://generativelanguage.googleapis.com/v1beta", exampleModel: "gemini-3.8-flash" },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com", exampleModel: "deepseek-flash" },
] as const;
export type AiEndpoint = {
  preset?: string;
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
export function validateAiEndpoint(input: unknown): AiEndpoint {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error();
    const v = input as AiEndpoint;
    if (
      Object.keys(v).filter((k) => k !== "preset").sort().join(",") !==
        "baseUrl,id,locality,models,name,requiresKey" ||
      typeof v.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(v.id) ||
      typeof v.name !== "string" ||
      !v.name.trim() ||
      v.name.length > 120 ||
      !["local", "hosted"].includes(v.locality) ||
      typeof v.requiresKey !== "boolean" ||
      typeof v.baseUrl !== "string" ||
      v.baseUrl.length > 2048 ||
      !Array.isArray(v.models) ||
      !v.models.length ||
      v.models.length > 100 ||
      v.models.some(
        (m) =>
          typeof m !== "string" ||
          !/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,255}$/.test(m),
      ) ||
      new Set(v.models).size !== v.models.length
    )
      throw new Error();
    if (v.preset !== undefined) {
      const preset = aiProviderPresets.find((p) => p.id === v.preset);
      if (!preset || v.baseUrl !== preset.baseUrl || v.locality !== "hosted" || !v.requiresKey)
        throw new Error();
    }
    const url = new URL(v.baseUrl);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !["http:", "https:"].includes(url.protocol) ||
      (v.locality === "hosted" && url.protocol !== "https:") ||
      (isIP(host) && !allowedAiAddress(host, v.locality)) ||
      (v.locality === "hosted" &&
        (host === "localhost" || host.endsWith(".localhost")))
    )
      throw new Error();
    return { ...v, baseUrl: url.href.replace(/\/$/, "") };
  } catch {
    throw new Error("Enter a valid model endpoint and model name");
  }
}
export function providerEndpoint(provider: {
  endpoint: unknown;
}): AiEndpoint | null {
  try {
    return validateAiEndpoint(provider.endpoint);
  } catch {
    return null;
  }
}
export const endpointDigest = (endpoint: AiEndpoint) => digest(endpoint);
export const aiCredentialEndpointDigest = (endpoint: AiEndpoint) =>
  digest({
    id: endpoint.id,
    baseUrl: endpoint.baseUrl,
    locality: endpoint.locality,
    requiresKey: endpoint.requiresKey,
    ...(endpoint.preset ? { preset: endpoint.preset } : {}),
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
/** Self-hosted OpenAI-compatible servers use /v1 when only an origin is supplied.
 * Keep the stored endpoint unchanged so credentials and approval digests remain valid.
 * Explicit paths and built-in provider protocols always take precedence.
 */
export function aiApiBaseUrl(endpoint: AiEndpoint) {
  const url = new URL(endpoint.baseUrl);
  if (!endpoint.preset && endpoint.locality === "local" && url.pathname === "/")
    url.pathname = "/v1";
  return url.href.replace(/\/$/, "");
}
/** Only metadata is sent. Redirects, unbounded bodies and response details are rejected. */
export async function testAiEndpoint(
  endpoint: AiEndpoint,
  modelId: string,
  key?: string,
) {
  const signal = AbortSignal.timeout(10000);
  const model = endpoint.preset === "gemini" ? modelId.replace(/^models\//, "") : modelId;
  if ((endpoint.preset === "gemini" || endpoint.preset === "anthropic") && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,255}$/.test(model))
    return "MODEL_UNAVAILABLE";
  const direct = endpoint.preset === "gemini" || endpoint.preset === "anthropic";
  const response = await aiHttpRequest(
    new URL(aiApiBaseUrl(endpoint) + "/models" + (direct ? "/" + encodeURIComponent(model) : "")),
    endpoint.locality,
    {
      headers: {
        accept: "application/json",
        ...(endpoint.preset === "anthropic"
          ? { "anthropic-version": "2023-06-01", ...(key ? { "x-api-key": key } : {}) }
          : endpoint.preset === "gemini"
            ? (key ? { "x-goog-api-key": key } : {})
            : (key ? { authorization: `Bearer ${key}` } : {})),
      },
      signal,
    },
  );
  if (!response.ok || !response.body)
    return response.status === 401 || response.status === 403
      ? "AUTH_REJECTED"
      : response.status === 404 && direct ? "MODEL_UNAVAILABLE" : "UNAVAILABLE";
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
    if (direct) {
      const record = value as { name?: string; id?: string; type?: string; lifecycle?: string };
      return (endpoint.preset === "gemini" ? record?.name === "models/" + model : (record?.type === "model" && typeof record.id === "string" && /^claude-[a-zA-Z0-9_.-]+$/.test(record.id) && record.lifecycle !== "retired"))
        ? "CONNECTED" : "MODEL_UNAVAILABLE";
    }
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
