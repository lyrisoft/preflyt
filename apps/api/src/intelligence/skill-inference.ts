import type { AiProviderConnection } from "../generated/prisma/client.js";
import {
  aiApiBaseUrl,
  aiCredentialEndpointDigest,
  decryptAiCredential,
  providerEndpoint,
} from "./ai-configuration.js";
import { aiHttpRequest } from "./ai-http.js";
import type { ReviewContext } from "./review-skills.js";
import { reviewPrompt, validateSkillOutput } from "./review-skills.js";
export async function runSkillInference(
  provider: AiProviderConnection,
  skills: { id: string; version: number; instructions: string }[],
  context: ReviewContext,
  maxOutputTokens: number,
  signal: AbortSignal,
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
  const response = await aiHttpRequest(
    new URL(aiApiBaseUrl(endpoint) + path),
    endpoint.locality,
    { headers, body: JSON.stringify(body), signal },
  );
  if (!response.ok) throw new Error("Model unavailable");
  const value = (await response.json()) as any;
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
