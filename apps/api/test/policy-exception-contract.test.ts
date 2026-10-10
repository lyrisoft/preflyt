import { expect, it } from "vitest";
import {
  exceptionRequestHash,
  matchesExceptionScope,
  validateExceptionRequest,
  type ApprovedException,
} from "../src/assessments/policy-exception-contract.js";
const now = new Date("2026-10-10T12:00:00Z");
const policy = {
  rules: [
    { id: "security", required: true, operator: "verified_check_succeeded" },
    { id: "tests", required: true, operator: "verified_check_succeeded" },
    { id: "lint", required: false, operator: "verified_check_succeeded" },
  ],
};
const input = () => ({
  sourceSha: "a".repeat(40),
  ruleIds: ["security"],
  reason: "Documented upstream false positive with a tracked fix.",
  expiresAt: "2026-10-11T12:00:00Z",
});
const scope = () => ({
  organizationId: "org",
  repositoryId: "repo",
  policyId: "policy",
  policyHash: "b".repeat(64),
  branchRef: "refs/heads/main",
  sourceSha: "a".repeat(40),
});
const approved = (): ApprovedException => {
  const value = {
    ...scope(),
    ...validateExceptionRequest(input(), policy, now),
    requestedById: "requester",
  };
  return {
    ...value,
    id: "exception",
    requestHash: exceptionRequestHash(value),
    state: "APPROVED",
    approvedById: "reviewer",
    approvedAt: now,
  };
};
it("binds approval to exact policy, branch, commit and frozen request content", () => {
  const row = approved();
  expect(matchesExceptionScope(row, scope(), now)).toBe(true);
  for (const key of Object.keys(scope())) {
    expect(
      matchesExceptionScope(row, { ...scope(), [key]: "different" }, now),
    ).toBe(false);
  }
  expect(
    matchesExceptionScope(
      { ...row, reason: "Changed after approval" },
      scope(),
      now,
    ),
  ).toBe(false);
  expect(
    matchesExceptionScope({ ...row, ruleIds: ["tests"] }, scope(), now),
  ).toBe(false);
  expect(
    matchesExceptionScope({ ...row, requestedById: "other" }, scope(), now),
  ).toBe(false);
  expect(
    matchesExceptionScope(
      { ...row, expiresAt: new Date("2026-10-12") },
      scope(),
      now,
    ),
  ).toBe(false);
});
it("rejects self approval, revoked or pending requests and expired approval", () => {
  const row = approved();
  expect(
    matchesExceptionScope(
      { ...row, approvedById: row.requestedById },
      scope(),
      now,
    ),
  ).toBe(false);
  expect(
    matchesExceptionScope({ ...row, approvedAt: null }, scope(), now),
  ).toBe(false);
  for (const state of ["REQUESTED", "REJECTED", "REVOKED", "EXPIRED"]) {
    expect(matchesExceptionScope({ ...row, state }, scope(), now)).toBe(false);
  }
  expect(matchesExceptionScope(row, scope(), row.expiresAt)).toBe(false);
});
it("requires a bounded reason, explicit checks, valid commit and future bounded expiry", () => {
  for (const change of [
    { reason: "too short" },
    { reason: "x".repeat(2001) },
    { sourceSha: "HEAD" },
    { expiresAt: "invalid" },
    { expiresAt: now.toISOString() },
    { expiresAt: "2026-11-10T12:00:00Z" },
    { ruleIds: [] },
    { ruleIds: ["security", "security"] },
    { ruleIds: ["unknown"] },
    { ruleIds: ["lint"] },
  ])
    expect(() =>
      validateExceptionRequest({ ...input(), ...change }, policy, now),
    ).toThrow();
});
it("cannot waive all required executed checks or substitute configuration evidence", () => {
  expect(() =>
    validateExceptionRequest(
      { ...input(), ruleIds: ["security", "tests"] },
      policy,
      now,
    ),
  ).toThrow("execution check");
  expect(() =>
    validateExceptionRequest(
      input(),
      {
        rules: [
          policy.rules[0],
          {
            id: "config",
            required: true,
            operator: "configuration_hint_present",
          },
        ],
      },
      now,
    ),
  ).toThrow("execution check");
});
