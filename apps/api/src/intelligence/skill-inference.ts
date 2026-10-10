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
export async function runSkillInference(
  provider: AiProviderConnection,
  skills: { id: string; version: number; instructions: string }[],
  context: ReviewContext,
  maxOutputTokens: number,
  signal: AbortSignal,
  onUsage?: (usage: ProviderUsage) => Promise<void>,
) {
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
  const prompt = reviewPrompt(skills, context);
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
      if (signal.reason?.name === "TimeoutError") throw new AiTransportError("TIMEOUT");
      signal.throwIfAborted();
    }
    throw error;
  }
  if (response.status === 429 || response.status >= 500)
    throw new AiTransportError("UPSTREAM_UNAVAILABLE");
  if (!response.ok) throw new Error("Model unavailable");
  const value = (await response.json()) as any;
  await onUsage?.(providerUsage(endpoint.preset, value, provider));
  let raw: unknown;
  if (endpoint.preset === "anthropic") {
    if (
      !Array.isArray(value.content) ||
      value.content.some((c: any) => c.type !== "text") ||
      value.stop_reason !== "end_turn"
    )
      throw new Error("Unsupported response");
    raw = value.content.map((c: any) => c.text).join("");
  } else if (endpoint.preset === "gemini") {
    const candidate = value.candidates?.[0];
    if (
      candidate?.finishReason !== "STOP" ||
      !Array.isArray(candidate.content?.parts) ||
      candidate.content.parts.some((p: any) => typeof p.text !== "string")
    )
      throw new Error("Unsupported response");
    raw = candidate.content.parts.map((p: any) => p.text).join("");
  } else {
    const choice = value.choices?.[0];
    if (
      choice?.finish_reason !== "stop" ||
      choice.message?.tool_calls ||
      choice.message?.function_call
    )
      throw new Error("Unsupported response");
    raw = choice.message?.content;
  }
  if (typeof raw !== "string") throw new Error("Invalid response");
  return validateSkillOutput(
    raw,
    context,
    skills.map((s) => s.id),
    key,
  );
}
export function reviewReservation(
  provider: AiProviderConnection,
  inputTokens: number,
  outputTokens: number,
) {
  const input = provider.inputPriceCentsPerMillion,
    output = provider.outputPriceCentsPerMillion;
  if (
    input === null ||
    output === null ||
    !Number.isInteger(input) ||
    !Number.isInteger(output) ||
    input < 0 ||
    output < 0 ||
    input > 100000000 ||
    output > 100000000
  )
    throw new Error("Set model rates before running reviews");
  return (
    BigInt(input) * BigInt(inputTokens) + BigInt(output) * BigInt(outputTokens)
  );
}
export type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  costMicroCents: string | null;
  costStatus: "ESTIMATED_FROM_REPORTED_USAGE" | "UNAVAILABLE";
};
export function providerUsage(
  preset: string | undefined,
  value: any,
  provider: Pick<
    AiProviderConnection,
    "inputPriceCentsPerMillion" | "outputPriceCentsPerMillion"
  >,
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
  let costMicroCents: string | null = null;
  if (inputTokens !== null && outputTokens !== null && cachedTokens === 0) {
    try {
      costMicroCents = reviewReservation(
        provider as AiProviderConnection,
        inputTokens,
        outputTokens,
      ).toString();
    } catch {}
  }
  return {
    inputTokens,
    outputTokens,
    cachedTokens,
    costMicroCents,
    costStatus:
      costMicroCents === null ? "UNAVAILABLE" : "ESTIMATED_FROM_REPORTED_USAGE",
  };
}
