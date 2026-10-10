import { expect, it } from "vitest";
import { applyApprovedExceptions } from "../src/assessments/approved-policy-evaluation.js";
import { publicationPayload } from "../src/assessments/check-publication.js";
import { digest } from "../src/assessments/assessment-digest.js";
import {
  exceptionRequestHash,
  type ApprovedException,
} from "../src/assessments/policy-exception-contract.js";
const definition = {
  rules: [
    { id: "tests", operator: "verified_check_succeeded" },
    { id: "security", operator: "verified_check_succeeded" },
  ],
};
const evaluation = (): any => {
  const result = {
    evaluatorVersion: 1,
    policyId: "policy",
    policyHash: "b".repeat(64),
    sourceSha: "a".repeat(40),
    assessmentHash: "c".repeat(64),
    status: "BLOCK",
    rules: [
      { ruleId: "tests", required: true, status: "PASS", reasons: [] },
      {
        ruleId: "security",
        required: true,
        status: "BLOCK",
        reasons: ["FAILED"],
      },
    ],
    requiredRules: 2,
    requiredRulesSatisfied: 1,
    requiredRulesBlocked: 1,
    requiredRulesIncomplete: 0,
  };
  return { ...result, evaluationHash: digest(result) };
};
const exception = (): ApprovedException => {
  const scope = {
    organizationId: "org",
    repositoryId: "repo",
    policyId: "policy",
    policyHash: "b".repeat(64),
    branchRef: "refs/heads/main",
    sourceSha: "a".repeat(40),
    ruleIds: ["security"],
    reason: "Reviewed vendor false positive",
    requestedById: "requester",
    expiresAt: new Date("2026-10-12"),
  };
  return {
    ...scope,
    id: "exception",
    requestHash: exceptionRequestHash(scope),
    state: "APPROVED",
    approvedById: "reviewer",
    approvedAt: new Date("2026-10-10"),
  };
};
it("records the exception separately and never changes the original failed outcome", () => {
  const original = evaluation();
  const result = applyApprovedExceptions(
    original,
    [exception()],
    definition,
    true,
  );
  expect(result.status).toBe("PASS_WITH_EXCEPTION");
  expect(result.requiredRulesSatisfied).toBe(1);
  expect(result.requiredRulesExcepted).toBe(1);
  expect(result.rules[1]).toMatchObject({
    status: "EXCEPTED",
    observedStatus: "BLOCK",
    exceptionId: "exception",
  });
  expect(result.exceptions).toHaveLength(1);
  expect(original.rules[1].status).toBe("BLOCK");
  expect(result.evaluationHash).not.toBe(original.evaluationHash);
});
it("cannot bypass unverified assessment integrity or all execution controls", () => {
  expect(
    applyApprovedExceptions(evaluation(), [exception()], definition, false)
      .status,
  ).toBe("BLOCK");
  const original = evaluation();
  original.rules[0].status = "INCOMPLETE";
  expect(
    applyApprovedExceptions(original, [exception()], definition, true).status,
  ).toBe("INCOMPLETE");
  expect(
    applyApprovedExceptions(
      original,
      [{ ...exception(), ruleIds: ["security", "tests"] }],
      definition,
      true,
    ).status,
  ).toBe("INCOMPLETE");
  expect(
    applyApprovedExceptions(
      evaluation(),
      [exception()],
      { rules: [{ id: "tests", operator: "configuration_hint_present" }] },
      true,
    ).status,
  ).toBe("INCOMPLETE");
});
it("keeps other failures and advisory warnings visible and binds changed exception approvals", () => {
  const original = evaluation();
  original.rules.push({
    ruleId: "lint",
    required: true,
    status: "BLOCK",
    reasons: ["FAILED"],
  });
  expect(
    applyApprovedExceptions(original, [exception()], definition, true).status,
  ).toBe("BLOCK");
  original.rules[2].required = false;
  expect(
    applyApprovedExceptions(original, [exception()], definition, true).status,
  ).toBe("WARN");
  const before = applyApprovedExceptions(
    evaluation(),
    [exception()],
    definition,
    true,
  );
  const changed = {
    ...exception(),
    reason: "A different independently reviewed reason",
  };
  changed.requestHash = exceptionRequestHash(changed);
  const after = applyApprovedExceptions(
    evaluation(),
    [changed],
    definition,
    true,
  );
  expect(before.evaluationHash).not.toBe(after.evaluationHash);
});

it("publishes an explicit reviewed-exception result and retains original failure evidence", () => {
  const content = {
    request: { sourceSha: "a".repeat(40) },
    plan: {},
    report: { checks: [{ ruleId: "security", result: "FAILED" }] },
  };
  const snapshot = {
    ...content,
    sourceSha: "a".repeat(40),
    assessmentHash: digest(content),
  };
  const original = { ...evaluation(), assessmentHash: snapshot.assessmentHash };
  const result = applyApprovedExceptions(
    original,
    [exception()],
    definition,
    true,
  );
  const published = publicationPayload(snapshot, "d".repeat(64), result);
  expect(published.payload.conclusion).toBe("success");
  expect(published.payload.output.title).toContain("reviewed exceptions");
  expect(published.payload.output.summary).toContain(exception().requestHash);
  expect(published.payload.output.summary).toContain(
    exception().expiresAt.toISOString(),
  );
  expect(published.payload.output.summary).toContain(
    "EXCEPTED (FAILED, INDEPENDENT_REVIEWED_EXCEPTION)",
  );
  expect(snapshot.report.checks[0].result).toBe("FAILED");
  expect(
    publicationPayload(snapshot, "d".repeat(64), { ...result, exceptions: [] })
      .payload.conclusion,
  ).toBe("action_required");
});
