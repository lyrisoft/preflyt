import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aiConfigurationEnabled,
  aiProviderPresets,
  aiCredentialEndpointDigest,
  aiCredentialKey,
  validateAiEndpoint,
  encryptAiCredential,
  decryptAiCredential,
  testAiEndpoint,
  endpointDigest,
  type AiEndpoint,
} from "../src/intelligence/ai-configuration.js";
const transport = vi.hoisted(() => vi.fn());
vi.mock("../src/intelligence/ai-http.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/intelligence/ai-http.js")>()),
  aiHttpRequest: transport,
}));
const endpoint = (): AiEndpoint => ({
  id: "gateway",
  name: "Model gateway",
  baseUrl: "https://reviewed.example/v1",
  locality: "hosted",
  requiresKey: true,
  models: ["reviewed-model"],
});
beforeEach(() =>
  vi.stubEnv("AI_PROVIDER_ENCRYPTION_KEY", randomBytes(32).toString("base64")),
);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("AI configuration safe defaults and encrypted credentials", () => {
  it("stays disabled until explicitly enabled and has no implicit external endpoints", () => {
    vi.stubEnv("AI_CONFIGURATION_ENABLED", undefined);
    expect(aiConfigurationEnabled()).toBe(false);
    vi.stubEnv("AI_CONFIGURATION_ENABLED", "true");
    expect(aiConfigurationEnabled()).toBe(true);
  });
  it("requires a canonical 32-byte deployment encryption key", () => {
    expect(aiCredentialKey()).toHaveLength(32);
    for (const value of [
      "",
      randomBytes(31).toString("base64"),
      randomBytes(33).toString("base64"),
      "not-a-key",
    ]) {
      vi.stubEnv("AI_PROVIDER_ENCRYPTION_KEY", value);
      expect(() => aiCredentialKey()).toThrow("32-byte");
    }
  });
  it("binds fresh encrypted keys to organization, connection and endpoint", () => {
    const hash = "e".repeat(64);
    const first = encryptAiCredential(
      "org",
      "provider",
      "fixture-provider-key",
      hash,
    );
    const second = encryptAiCredential(
      "org",
      "provider",
      "fixture-provider-key",
      hash,
    );
    expect(first).not.toBe(second);
    expect(first).not.toContain("fixture-provider-key");
    expect(decryptAiCredential("org", "provider", first, hash)).toBe(
      "fixture-provider-key",
    );
    for (const args of [
      ["other", "provider", hash],
      ["org", "other", hash],
      ["org", "provider", "f".repeat(64)],
    ]) {
      expect(() =>
        decryptAiCredential(args[0]!, args[1]!, first, args[2]!),
      ).toThrow("could not be decrypted");
    }
    const ambiguous = encryptAiCredential(
      "org:provider",
      "connection",
      "fixture-provider-key",
      hash,
    );
    expect(() =>
      decryptAiCredential("org", "provider:connection", ambiguous, hash),
    ).toThrow();
  });
  it("rejects tampering and malformed or oversized credentials without echoing keys", () => {
    const hash = "e".repeat(64);
    const value = encryptAiCredential(
      "org",
      "provider",
      "fixture-provider-key",
      hash,
    );
    for (const changed of [
      value.replace(/^v1/, "v2"),
      value.slice(0, -1),
      value + ".extra",
      "v1.bad.bad.bad",
    ])
      expect(() =>
        decryptAiCredential("org", "provider", changed, hash),
      ).toThrow();
    for (const key of [
      "",
      "bad key",
      "key\n",
      "x".repeat(4097),
      "😀".repeat(1025),
    ])
      expect(() => encryptAiCredential("org", "provider", key, hash)).toThrow(
        "valid provider key",
      );
  });
});
describe("admin-approved model endpoints", () => {
  it("accepts admin hosted and self-hosted models without environment configuration", () => {
    const hosted = validateAiEndpoint(endpoint()),
      local = validateAiEndpoint({
        ...endpoint(),
        baseUrl: "http://model-server:4000/v1/",
        locality: "local",
        requiresKey: false,
      });
    expect(local.baseUrl).toBe("http://model-server:4000/v1");
    expect(endpointDigest(hosted)).not.toBe(
      endpointDigest({ ...hosted, models: ["other"] }),
    );
  });
  it.each([
    { baseUrl: "http://external.example" },
    { baseUrl: "https://user:password@external.example" },
    { baseUrl: "https://external.example?key=value" },
    { baseUrl: "https://external.example#secret" },
    { baseUrl: "file:///secret" },
    { models: [] },
    { models: ["same", "same"] },
    { id: "invalid/id" },
    { extra: true },
    { baseUrl: "https://169.254.169.254/latest" },
    { baseUrl: "https://127.0.0.1" },
    { baseUrl: "https://[::ffff:a9fe:a9fe]" },
  ])("rejects malformed or unsafe endpoint %j", (patch) => {
    expect(() => validateAiEndpoint({ ...endpoint(), ...patch })).toThrow(
      "valid model endpoint",
    );
  });
});
describe("metadata-only connection testing", () => {
  it("tests model availability without sending source, generating an answer or following redirects", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [{ id: "reviewed-model" }] })),
    );
    transport.mockImplementation(fetcher);
    expect(
      await testAiEndpoint(
        endpoint(),
        "reviewed-model",
        "fixture-provider-key",
      ),
    ).toBe("CONNECTED");
    const [url, locality, options] = fetcher.mock.calls[0] as any;
    expect(locality).toBe("hosted");
    expect(url.href).toBe("https://reviewed.example/v1/models");
    expect(options).toMatchObject({
      headers: {
        accept: "application/json",
        authorization: "Bearer fixture-provider-key",
      },
    });
    expect(options.body).toBeUndefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([
    [401, "AUTH_REJECTED"],
    [403, "AUTH_REJECTED"],
    [503, "UNAVAILABLE"],
  ])(
    "reports upstream status %s without response details",
    async (status, expected) => {
      transport.mockImplementation(
        vi.fn(
          async () =>
            new Response("private upstream detail", { status: Number(status) }),
        ),
      );
      expect(await testAiEndpoint(endpoint(), "reviewed-model")).toBe(expected);
    },
  );
  it("distinguishes unavailable models from a tested connection", async () => {
    transport.mockImplementation(
      vi.fn(
        async () => new Response(JSON.stringify({ data: [{ id: "other" }] })),
      ),
    );
    expect(await testAiEndpoint(endpoint(), "reviewed-model")).toBe(
      "MODEL_UNAVAILABLE",
    );
  });
  it("rejects oversized, malformed and outage responses", async () => {
    for (const response of [
      () => new Response("x".repeat(1048577)),
      () => new Response("invalid-json"),
    ]) {
      transport.mockImplementation(vi.fn(async () => response()));
      await expect(
        testAiEndpoint(endpoint(), "reviewed-model"),
      ).rejects.toThrow();
    }
    transport.mockImplementation(
      vi.fn(async () => {
        throw new DOMException("fixture timeout", "TimeoutError");
      }),
    );
    await expect(testAiEndpoint(endpoint(), "reviewed-model")).rejects.toThrow(
      "fixture timeout",
    );
  });
});

describe("built-in provider metadata checks", () => {
  it.each(aiProviderPresets)("uses correct authentication for $id", async (preset) => {
    const endpoint = validateAiEndpoint({ id: "fixture", name: preset.name, baseUrl: preset.baseUrl, locality: "hosted", requiresKey: true, models: [preset.exampleModel], preset: preset.id });
    const body = preset.id === "gemini" ? { name: "models/" + preset.exampleModel } : preset.id === "anthropic" ? { id: preset.exampleModel, type: "model" } : { data: [{ id: preset.exampleModel }] };
    transport.mockResolvedValueOnce(new Response(JSON.stringify(body)));
    expect(await testAiEndpoint(endpoint, preset.exampleModel, "fixture-key")).toBe("CONNECTED");
    const [url, locality, options] = transport.mock.lastCall!;
    expect(url.origin).toBe(new URL(preset.baseUrl).origin);
    expect(url.search).toBe("");
    expect(locality).toBe("hosted");
    expect(options.headers[preset.id === "gemini" ? "x-goog-api-key" : preset.id === "anthropic" ? "x-api-key" : "authorization"]).toBe(preset.id === "gemini" || preset.id === "anthropic" ? "fixture-key" : "Bearer fixture-key");
    if (preset.id === "anthropic") expect(options.headers["anthropic-version"]).toBe("2023-06-01");
  });
  it("rejects preset endpoint overrides and separates credential bindings", () => {
    const preset = aiProviderPresets[0];
    const value = { ...endpoint(), baseUrl: preset.baseUrl, preset: preset.id };
    expect(() => validateAiEndpoint({ ...value, baseUrl: "https://other.example" })).toThrow();
    expect(() => validateAiEndpoint({ ...value, requiresKey: false })).toThrow();
    expect(() => validateAiEndpoint({ ...value, preset: "unknown" })).toThrow();
    const { preset: ignored, ...custom } = value;
    expect(aiCredentialEndpointDigest(value)).not.toBe(aiCredentialEndpointDigest(custom));
  });
  it("handles rejected keys and unknown native models", async () => {
    const preset = aiProviderPresets[2];
    const value = { ...endpoint(), baseUrl: preset.baseUrl, preset: preset.id };
    transport.mockResolvedValueOnce(new Response("", { status: 403 }));
    expect(await testAiEndpoint(value, "gemini-example", "fixture-key")).toBe("AUTH_REJECTED");
    transport.mockResolvedValueOnce(new Response("", { status: 404 }));
    expect(await testAiEndpoint(value, "gemini-example", "fixture-key")).toBe("MODEL_UNAVAILABLE");
  });
});

it("accepts a Claude alias resolved by its metadata endpoint", async () => {
  const preset = aiProviderPresets[1];
  const value = { ...endpoint(), baseUrl: preset.baseUrl, preset: preset.id };
  transport.mockResolvedValueOnce(new Response(JSON.stringify({ type: "model", id: "claude-example-20261009" })));
  expect(await testAiEndpoint(value, "claude-example", "fixture-key")).toBe("CONNECTED");
  expect(transport.mock.lastCall![0].pathname).toBe("/v1/models/claude-example");
  transport.mockResolvedValueOnce(new Response(JSON.stringify({ type: "model", id: "claude-example", lifecycle: "retired" })));
  expect(await testAiEndpoint(value, "claude-example", "fixture-key")).toBe("MODEL_UNAVAILABLE");
});
