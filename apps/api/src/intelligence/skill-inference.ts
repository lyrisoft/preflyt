import type { AiProviderConnection } from "../generated/prisma/client.js";
import {
  aiApiBaseUrl,
  aiCredentialEndpointDigest,
  decryptAiCredential,
  providerEndpoint,
} from "./ai-configuration.js";
import { aiHttpRequest, AiTransportError } from "./ai-http.js";
import type { ReviewContext } from "./review-skills.js";
import { reviewPrompt, validateSkillOutput } from "./review-skills.js";
// Fixed provider response bound; users do not configure token limits or prices.
export const aiResponseTokenLimit = 8192;

/** Safe response diagnostics; never retain provider bodies or credentials. */
export class AiResponseError extends Error {
  constructor(
    readonly code:
      | "MODEL_UNAVAILABLE"
      | "TRUNCATED"
      | "INVALID_RESPONSE"
      | "UNSAFE_RESPONSE"
      | "REFUSED"
      | "INVALID_REVIEW_SCHEMA"
      | "INVALID_EVIDENCE"
      | "UNSUPPORTED_CLAIM",
    readonly status?: number,
  ) {
    super(
      code === "TRUNCATED"
        ? "Model response was cut off"
        : "Model response unavailable",
    );
    this.name = "AiResponseError";
  }
}

export async function runSkillInference(
  provider: AiProviderConnection,
  skills: { id: string; version: number; instructions: string }[],
  context: ReviewContext,
  maxOutputTokens: number,
  signal: AbortSignal,
  onUsage?: (usage: ProviderUsage) => Promise<void>,
) {
  return runPromptInference(
    provider,
    reviewPrompt(skills, context),
    maxOutputTokens,
    signal,
    (raw, key) => {
      try {
        return validateSkillOutput(raw, context, skills.map((s) => s.id), key);
      } catch (error) {
        // Retain only a fixed diagnostic code, never model content or credentials.
        const message = error instanceof Error ? error.message : "";
        throw new AiResponseError(
          message === "Unsafe model output" ? "UNSAFE_RESPONSE" :
          message === "Invalid evidence reference" ? "INVALID_EVIDENCE" :
          message === "Unsupported model claim" ? "UNSUPPORTED_CLAIM" : "INVALID_REVIEW_SCHEMA",
        );
      }
    },
    onUsage,
    { jsonOutput: true, jsonSchema: {
      type: "object", additionalProperties: false,
      required: ["assessmentHash", "sourceSha", "findings"],
      properties: {
        assessmentHash: { type: "string", enum: [context.assessmentHash] },
        sourceSha: { type: "string", enum: [context.sourceSha] },
        findings: { type: "array", maxItems: 20, items: {
          type: "object", additionalProperties: false,
          required: ["checkId", "evidenceRefs", "summary", "recommendation"],
          properties: {
            checkId: { type: "string", enum: skills.map((s) => s.id) },
            evidenceRefs: { type: "array", minItems: 1, maxItems: 10, items: {
              type: "string", enum: [...context.evidence.map((e) => e.ref), ...(context.source?.lines.map((l) => l.ref) ?? [])],
            } },
            summary: { type: "string", maxLength: 600 },
            recommendation: { type: "string", maxLength: 600 },
          },
        } },
      },
    } },
  );
}
export async function runPromptInference<T>(
  provider: AiProviderConnection,
  prompt: { system: string; user: string },
  maxOutputTokens: number,
  signal: AbortSignal,
  validate: (raw: string, credential?: string) => T,
  onUsage?: (usage: ProviderUsage) => Promise<void>,
  options?: { jsonOutput?: boolean; jsonSchema?: Record<string, unknown> },
): Promise<T> {
  const endpoint = providerEndpoint(provider);
  if (!endpoint) throw new Error("Connection unavailable");
  const key = provider.encryptedCredential
    ? decryptAiCredential(
        provider.organizationId,
        provider.id,
        provider.encryptedCredential,
        aiCredentialEndpointDigest(endpoint),
      )
    : undefined;
  let path = "/chat/completions",
    headers: Record<string, string> = {
      "content-type": "application/json",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    };
  let body: unknown = {
    model: provider.modelId,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    ...(endpoint.preset === "openai"
      ? { max_completion_tokens: maxOutputTokens }
      : { max_tokens: maxOutputTokens }),
    ...(options?.jsonOutput &&
    ["openai", "deepseek"].includes(endpoint.preset ?? "")
      ? { response_format: endpoint.preset === "openai" && options.jsonSchema
        ? { type: "json_schema", json_schema: { name: "preflyt_pr_review", strict: true, schema: options.jsonSchema } }
        : { type: "json_object" } }
      : {}),
    stream: false,
  };
  if (endpoint.preset === "anthropic") {
    path = "/messages";
    headers = {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      ...(key ? { "x-api-key": key } : {}),
    };
    body = {
      model: provider.modelId,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
      max_tokens: maxOutputTokens,
    };
  } else if (endpoint.preset === "gemini") {
    path =
      "/models/" +
      encodeURIComponent(provider.modelId.replace(/^models\//, "")) +
      ":generateContent";
    headers = {
      "content-type": "application/json",
      ...(key ? { "x-goog-api-key": key } : {}),
    };
    body = {
      systemInstruction: { parts: [{ text: prompt.system }] },
      contents: [{ role: "user", parts: [{ text: prompt.user }] }],
      generationConfig: {
        maxOutputTokens,
        responseMimeType: "application/json",
      },
    };
  }
  signal.throwIfAborted();
  let response: Response;
  try {
    response = await aiHttpRequest(
      new URL(aiApiBaseUrl(endpoint) + path),
      endpoint.locality,
      { headers, body: JSON.stringify(body), signal },
    );
  } catch (error) {
    // The inference deadline is a transport failure; caller cancellation and access
    // revocation are not. Never retain a provider URL, response body or key here.
    if (signal.aborted) {
      if (signal.reason?.name === "TimeoutError")
        throw new AiTransportError("TIMEOUT");
      signal.throwIfAborted();
    }
    throw error;
  }
  if (response.status === 429 || response.status >= 500)
    throw new AiTransportError("UPSTREAM_UNAVAILABLE");
  if (!response.ok)
    throw new AiResponseError("MODEL_UNAVAILABLE", response.status);
  let value: any;
  try {
    value = await response.json();
  } catch {
    throw new AiResponseError("INVALID_RESPONSE");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AiResponseError("INVALID_RESPONSE");
  await onUsage?.(providerUsage(endpoint.preset, value));
  let raw: unknown;
  if (endpoint.preset === "anthropic") {
    if (value.stop_reason === "max_tokens")
      throw new AiResponseError("TRUNCATED");
    if (value.stop_reason === "refusal") throw new AiResponseError("REFUSED");
    if (
      !Array.isArray(value.content) ||
      value.content.some((c: any) => c.type !== "text") ||
      value.stop_reason !== "end_turn"
    )
      throw new AiResponseError("INVALID_RESPONSE");
    raw = value.content.map((c: any) => c.text).join("");
  } else if (endpoint.preset === "gemini") {
    const candidate = value.candidates?.[0];
    if (candidate?.finishReason === "MAX_TOKENS")
      throw new AiResponseError("TRUNCATED");
    if (
      value.promptFeedback?.blockReason ||
      candidate?.finishReason === "SAFETY"
    )
      throw new AiResponseError("REFUSED");
    if (
      candidate?.finishReason !== "STOP" ||
      !Array.isArray(candidate.content?.parts) ||
      candidate.content.parts.some((p: any) => typeof p.text !== "string")
    )
      throw new AiResponseError("INVALID_RESPONSE");
    raw = candidate.content.parts.map((p: any) => p.text).join("");
  } else {
    const choice = value.choices?.[0];
    if (choice?.finish_reason === "length")
      throw new AiResponseError("TRUNCATED");
    if (choice?.finish_reason === "content_filter" || choice?.message?.refusal)
      throw new AiResponseError("REFUSED");
    if (
      choice?.finish_reason !== "stop" ||
      choice.message?.tool_calls ||
      choice.message?.function_call
    )
      throw new AiResponseError("INVALID_RESPONSE");
    raw = choice.message?.content;
  }
  if (typeof raw !== "string") throw new AiResponseError("INVALID_RESPONSE");
  if (key && raw.includes(key)) throw new AiResponseError("UNSAFE_RESPONSE");
  return validate(raw, key);
}
export type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
};
export function providerUsage(
  preset: string | undefined,
  value: any,
): ProviderUsage {
  const count = (v: unknown) =>
    Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 100000000
      ? (v as number)
      : null;
  const inputTokens = count(
    preset === "anthropic"
      ? value.usage?.input_tokens
      : preset === "gemini"
        ? value.usageMetadata?.promptTokenCount
        : value.usage?.prompt_tokens,
  );
  const candidates = count(value.usageMetadata?.candidatesTokenCount);
  const thoughts = count(value.usageMetadata?.thoughtsTokenCount ?? 0);
  const outputTokens =
    preset === "gemini"
      ? candidates === null || thoughts === null
        ? null
        : count(candidates + thoughts)
      : count(
          preset === "anthropic"
            ? value.usage?.output_tokens
            : value.usage?.completion_tokens,
        );
  const cachedTokens = count(
    preset === "anthropic"
      ? (value.usage?.cache_read_input_tokens ?? 0) +
          (value.usage?.cache_creation_input_tokens ?? 0)
      : preset === "gemini"
        ? (value.usageMetadata?.cachedContentTokenCount ?? 0)
        : (value.usage?.prompt_tokens_details?.cached_tokens ?? 0),
  );
  return {
    inputTokens,
    outputTokens,
    cachedTokens,
  };
}
