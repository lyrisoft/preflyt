import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aiConfigurationEnabled,
  aiCredentialKey,
  aiEndpoints,
  encryptAiCredential,
  decryptAiCredential,
  testAiEndpoint,
  endpointDigest,
  type AiEndpoint,
} from "../src/intelligence/ai-configuration.js";
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
    vi.stubEnv("AI_APPROVED_ENDPOINTS", undefined);
    expect(aiConfigurationEnabled()).toBe(false);
    expect(aiEndpoints()).toEqual([]);
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
describe("reviewed endpoints", () => {
  it("normalizes only explicitly reviewed hosted and local endpoint definitions", () => {
    vi.stubEnv(
      "AI_APPROVED_ENDPOINTS",
      JSON.stringify([
        endpoint(),
        {
          ...endpoint(),
          id: "local",
          baseUrl: "http://local-gateway:4000/v1/",
          locality: "local",
          requiresKey: false,
        },
      ]),
    );
    const endpoints = aiEndpoints();
    expect(endpoints[1].baseUrl).toBe("http://local-gateway:4000/v1");
    expect(endpointDigest(endpoints[0])).not.toBe(
      endpointDigest({ ...endpoints[0], models: ["other"] }),
    );
  });
  it.each([
    { baseUrl: "http://external.example" },
    { baseUrl: "https://user:password@external.example" },
    { baseUrl: "https://reviewed.example?key=value" },
    { baseUrl: "file:///secret" },
    { models: [] },
    { models: ["same", "same"] },
    { id: "invalid/id" },
    { extra: true },
  ])("rejects invalid review input %j", (patch) => {
    vi.stubEnv(
      "AI_APPROVED_ENDPOINTS",
      JSON.stringify([{ ...endpoint(), ...patch }]),
    );
    expect(() => aiEndpoints()).toThrow("reviewed endpoint");
  });
  it("rejects duplicate endpoints and oversized inventories", () => {
    for (const list of [
      [endpoint(), endpoint()],
      Array.from({ length: 33 }, (_, i) => ({
        ...endpoint(),
        id: "endpoint-" + i,
      })),
    ]) {
      vi.stubEnv("AI_APPROVED_ENDPOINTS", JSON.stringify(list));
      expect(() => aiEndpoints()).toThrow();
    }
  });
});
describe("metadata-only connection testing", () => {
  it("tests model availability without sending source, generating an answer or following redirects", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [{ id: "reviewed-model" }] })),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(
      await testAiEndpoint(
        endpoint(),
        "reviewed-model",
        "fixture-provider-key",
      ),
    ).toBe("CONNECTED");
    const [url, options] = fetcher.mock.calls[0] as any;
    expect(url).toBe("https://reviewed.example/v1/models");
    expect(options).toMatchObject({
      redirect: "error",
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
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response("private upstream detail", { status: Number(status) }),
        ),
      );
      expect(await testAiEndpoint(endpoint(), "reviewed-model")).toBe(expected);
    },
  );
  it("distinguishes unavailable models from a tested connection", async () => {
    vi.stubGlobal(
      "fetch",
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
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => response()),
      );
      await expect(
        testAiEndpoint(endpoint(), "reviewed-model"),
      ).rejects.toThrow();
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("fixture timeout", "TimeoutError");
      }),
    );
    await expect(testAiEndpoint(endpoint(), "reviewed-model")).rejects.toThrow(
      "fixture timeout",
    );
  });
});
