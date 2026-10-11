import { afterEach, expect, it, vi } from "vitest";
import { configurationFields } from "../src/configuration/configuration-catalogue.js";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.resetModules();
});
it("pins connection secrets until restart while updating live feature switches", async () => {
  const runtime = await import("../src/configuration/runtime-configuration.js");
  const initial = Object.fromEntries(
    configurationFields.map((field) => [field.key, field.defaultValue]),
  );
  runtime.applyConfiguration({ ...initial, SMTP_HOST: "old.example" }, true);
  runtime.applyConfiguration({
    ...initial,
    SMTP_HOST: "new.example",
    NOTIFICATIONS_ENABLED: "true",
  });
  expect(runtime.configurationValue("SMTP_HOST")).toBe("old.example");
  expect(runtime.configurationValue("NOTIFICATIONS_ENABLED")).toBe("true");
  expect(
    runtime.configurationNeedsRestart({ ...initial, SMTP_HOST: "new.example" }),
  ).toBe(true);
  runtime.applyConfiguration({ ...initial, SMTP_HOST: "new.example" }, true);
  expect(runtime.configurationValue("SMTP_HOST")).toBe("new.example");
});
it("fails closed on a configuration read failure and recovers without using legacy environment overrides", async () => {
  vi.useFakeTimers();
  vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
  const runtime = await import("../src/configuration/runtime-configuration.js");
  const store = await import("../src/configuration/configuration-store.js");
  const values = Object.fromEntries(
    configurationFields.map((field) => [field.key, field.defaultValue]),
  );
  runtime.applyConfiguration(
    { ...values, SMTP_HOST: "stored.example", NOTIFICATIONS_ENABLED: "true" },
    true,
  );
  const findUnique = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({
      values: {
        ...values,
        SMTP_HOST: "stored.example",
        NOTIFICATIONS_ENABLED: "true",
      },
      encryptedSecrets: null,
    });
  const stop = store.watchConfiguration({
    deploymentConfiguration: { findUnique },
  } as never);
  await vi.advanceTimersByTimeAsync(5000);
  expect(runtime.configurationValue("NOTIFICATIONS_ENABLED")).toBe("false");
  expect(runtime.configurationValue("SMTP_HOST")).toBe("stored.example");
  await vi.advanceTimersByTimeAsync(5000);
  expect(runtime.configurationValue("NOTIFICATIONS_ENABLED")).toBe("true");
  stop();
});

it("accepts one-App activation and validates the optional separate connection", async () => {
  const { generateKeyPairSync } = await import("node:crypto");
  const { validateConfiguration, unpackConfiguration } =
    await import("../src/configuration/configuration-store.js");
  const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
  const values = {
    GITHUB_APP_ID: "100",
    GITHUB_APP_PRIVATE_KEY: privateKey,
    GITHUB_RULESET_ACTIVATION_ENABLED: "true",
    GITHUB_GOVERNANCE_SEPARATE_APP_ENABLED: "false",
  };
  expect(() => validateConfiguration(values, true)).not.toThrow();
  expect(() =>
    validateConfiguration({ ...values, GITHUB_APP_PRIVATE_KEY: "" }, true),
  ).toThrow("GitHub connection");
  expect(() =>
    validateConfiguration(
      { ...values, GITHUB_GOVERNANCE_SEPARATE_APP_ENABLED: "true" },
      true,
    ),
  ).toThrow("separate governance connection");
  const separate = {
    ...values,
    GITHUB_GOVERNANCE_SEPARATE_APP_ENABLED: "true",
    GITHUB_GOVERNANCE_APP_ID: "200",
    GITHUB_GOVERNANCE_PRIVATE_KEY: privateKey,
    GITHUB_GOVERNANCE_INSTALLATION_ID: "700",
  };
  expect(() => validateConfiguration(separate, true)).not.toThrow();
  expect(() =>
    validateConfiguration(
      { ...separate, GITHUB_GOVERNANCE_APP_ID: "100" },
      true,
    ),
  ).toThrow("different App ID");
  expect(
    unpackConfiguration({
      values: { GITHUB_APP_ID: "100", GITHUB_GOVERNANCE_APP_ID: "200" },
      encryptedSecrets: null,
    }).GITHUB_GOVERNANCE_SEPARATE_APP_ENABLED,
  ).toBe("true");
  expect(
    unpackConfiguration({ values: {}, encryptedSecrets: null })
      .GITHUB_GOVERNANCE_SEPARATE_APP_ENABLED,
  ).toBe("false");
});
