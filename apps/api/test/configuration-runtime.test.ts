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
