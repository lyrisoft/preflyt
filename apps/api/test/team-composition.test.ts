import { expect, it, vi } from "vitest";
import {
  catalogue,
  type PackRef,
  type StandardPack,
  packDigest,
} from "../src/standards/catalogue.js";
import { composeTeamStandards } from "../src/teams/team-composition.js";
import { verifyTeamContext } from "../src/teams/team-context.js";
import { digest } from "../src/assessments/assessment-digest.js";
const ref = (index: number) => ({
  id: catalogue[index].id,
  version: catalogue[index].version,
  digest: catalogue[index].digest,
});
it("combines multiple teams with repository standards and preserves the strongest profile", () => {
  const result = composeTeamStandards([
    { label: "Repository", profile: "STRICT", packs: [ref(0)] },
    { label: "Platform", profile: "DEFAULT", packs: [ref(0), ref(2)] },
    { label: "Security", profile: "RECOMMENDED", packs: [ref(1)] },
  ]);
  expect(result.conflicts).toEqual([]);
  expect(result.profile).toBe("STRICT");
  expect(result.packs).toHaveLength(3);
});
it("rejects unverifiable versions and digests instead of choosing a winner", () => {
  const result = composeTeamStandards([
    {
      label: "Team",
      profile: "RECOMMENDED",
      packs: [{ ...ref(0), digest: "bad" }],
    },
  ]);
  expect(result.conflicts).toContain(
    "Team: standard version could not be verified",
  );
});
it("reports conflicting versions of an organization standard", () => {
  const make = (version: string): PackRef & { digest: string } => {
    const { digest: _digest, ...base } = catalogue[0];
    const p = {
      ...base,
      owner: "Organization",
      stages: ["repository", "pull_request", "ci"],
      changelog: ["Organization-managed version."],
      id: "org-standard-11111111-1111-1111-1111-111111111111",
      version,
    };
    const definition = { ...p, digest: packDigest(p) } as StandardPack;
    return { id: p.id, version, digest: definition.digest, definition };
  };
  const a = make("1.0.1"),
    b = make("1.0.2");
  const result = composeTeamStandards([
    { label: "Team A", profile: "DEFAULT", packs: [a] },
    { label: "Team B", profile: "STRICT", packs: [b] },
  ]);
  expect(result.conflicts.some((c) => c.includes("conflicting versions"))).toBe(
    true,
  );
});
it("rejects malformed team policy sources", async () => {
  await expect(verifyTeamContext({} as never, "repo", [null])).rejects.toThrow(
    "could not be verified",
  );
});
it("rejects a scope change or stale GitHub source before gate publication", async () => {
  const definition = {
    branchRef: "refs/heads/main",
    profile: "RECOMMENDED",
    packs: [ref(0)],
  };
  const assignment = { ...definition, digest: digest(definition) };
  const source = {
    teamId: "team",
    organizationId: "org",
    revision: 1,
    assignmentId: "assignment",
    digest: assignment.digest,
  };
  const db = {
    preflytTeam: { findFirst: vi.fn().mockResolvedValue({ source: "LOCAL" }) },
    teamPolicyAssignment: { findFirst: vi.fn().mockResolvedValue(assignment) },
  };
  await expect(
    verifyTeamContext(db as never, "repo", [source]),
  ).resolves.toBeUndefined();
  db.preflytTeam.findFirst.mockResolvedValue(null);
  await expect(
    verifyTeamContext(db as never, "repo", [source]),
  ).rejects.toThrow("scope changed");
  db.preflytTeam.findFirst.mockResolvedValue({
    source: "GITHUB",
    syncState: "STALE",
  });
  await expect(
    verifyTeamContext(db as never, "repo", [source]),
  ).rejects.toThrow("scope changed");
});
