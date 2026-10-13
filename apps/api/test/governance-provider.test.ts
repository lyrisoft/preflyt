import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@octokit/app", () => ({
  App: class {
    octokit = { request };
  },
}));
import { GovernanceProvider } from "../src/github/governance-provider.js";
beforeEach(() => {
  request.mockReset();
  vi.stubEnv("GITHUB_APP_ID", "100");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "primary-key");
  vi.stubEnv("GITHUB_GOVERNANCE_SEPARATE_APP_ENABLED", "false");
});
afterEach(() => vi.unstubAllEnvs());
function installation(overrides = {}) {
  return {
    data: {
      app_id: 100,
      account: { type: "Organization", login: "lyrisoft" },
      permissions: { organization_administration: "write" },
      ...overrides,
    },
  };
}
it("requests only organization ruleset permissions using the connected App installation", async () => {
  request
    .mockResolvedValueOnce(installation())
    .mockResolvedValueOnce({ data: { token: "scoped-test-token" } });
  const connection = await new GovernanceProvider().open(
    "lyrisoft/project",
    700n,
  );
  expect(connection.config).toMatchObject({
    appId: "100",
    installationId: 700n,
    separateApp: false,
  });
  expect(request).toHaveBeenLastCalledWith(
    "POST /app/installations/{installation_id}/access_tokens",
    expect.objectContaining({
      installation_id: 700,
      permissions: { organization_administration: "write" },
    }),
  );
});
it.each([
  { app_id: 101 },
  { account: { type: "Organization", login: "another-org" } },
  { account: { type: "User", login: "lyrisoft" } },
  { suspended_at: "2026-10-11" },
  { permissions: { organization_administration: "read" } },
])(
  "rejects unauthorized installations without issuing a write token: %j",
  async (overrides) => {
    request.mockResolvedValueOnce(installation(overrides));
    await expect(
      new GovernanceProvider().open("lyrisoft/project", 700n),
    ).rejects.toThrow("Administration: write");
    expect(request).toHaveBeenCalledTimes(1);
  },
);
