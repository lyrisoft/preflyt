import { afterEach, expect, it, vi } from "vitest";
import { governanceConfiguration } from "../src/github/governance-config.js";
import { governanceAppMode } from "../src/configuration/configuration-catalogue.js";
afterEach(() => vi.unstubAllEnvs());
function configure(separate = false) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("GITHUB_APP_ID", "4585551");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "primary-secret");
  vi.stubEnv("GITHUB_GOVERNANCE_SEPARATE_APP_ENABLED", String(separate));
  vi.stubEnv("GITHUB_GOVERNANCE_APP_ID", "9876543");
  vi.stubEnv("GITHUB_GOVERNANCE_PRIVATE_KEY", "governance-secret");
  vi.stubEnv("GITHUB_GOVERNANCE_INSTALLATION_ID", "153542598");
}
it("uses the connected repository installation with one App in production", () => {
  configure();
  expect(governanceConfiguration(700n)).toMatchObject({
    appId: "4585551",
    privateKey: "primary-secret",
    installationId: 700n,
    separateApp: false,
  });
  expect(governanceConfiguration(800n).installationId).toBe(800n);
});
it("uses optional separate credentials only when selected", () => {
  configure(true);
  expect(governanceConfiguration(700n)).toMatchObject({
    appId: "9876543",
    privateKey: "governance-secret",
    installationId: 153542598n,
    separateApp: true,
  });
});
it("does not fall back to the primary App for an incomplete separate connection", () => {
  configure(true);
  vi.stubEnv("GITHUB_GOVERNANCE_PRIVATE_KEY", "");
  expect(() => governanceConfiguration(700n)).toThrow("Configure the separate");
});
it("requires a connected installation rather than using an unrelated configured installation", () => {
  configure();
  expect(() => governanceConfiguration()).toThrow("Connect the GitHub App");
});
it("rejects the same App ID when separate App isolation was requested", () => {
  configure(true);
  vi.stubEnv("GITHUB_GOVERNANCE_APP_ID", "4585551");
  expect(() => governanceConfiguration(700n)).toThrow("different App ID");
});
it("defaults new connections to one App and preserves existing separate connections on upgrade", () => {
  expect(governanceAppMode({})).toBe("false");
  expect(governanceAppMode({ GITHUB_GOVERNANCE_INSTALLATION_ID: "700" })).toBe(
    "false",
  );
  expect(
    governanceAppMode({ GITHUB_APP_ID: "1", GITHUB_GOVERNANCE_APP_ID: "2" }),
  ).toBe("true");
  expect(
    governanceAppMode({ GITHUB_APP_ID: "1", GITHUB_GOVERNANCE_APP_ID: "1" }),
  ).toBe("false");
  expect(
    governanceAppMode({
      GITHUB_APP_ID: "1",
      GITHUB_GOVERNANCE_APP_ID: "2",
      GITHUB_GOVERNANCE_SEPARATE_APP_ENABLED: "false",
    }),
  ).toBe("false");
});
