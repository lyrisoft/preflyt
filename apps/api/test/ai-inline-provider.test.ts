import { expect, it, vi, afterEach } from "vitest";
import { GitHubProviderService } from "../src/github/github-provider.service.js";
import { prReviewSource } from "../src/intelligence/pr-review-context.js";
const context = {
  version: 1 as const,
  head: { repositoryId: "101", ref: "feature", sha: "a".repeat(40) },
  base: { repositoryId: "101", ref: "main", sha: "b".repeat(40) },
  state: "open" as const,
  draft: false,
  merged: false,
};
const source = prReviewSource(1, context, [
  { filename: "src/api.ts", patch: "@@ -0,0 +1 @@\n+handle(input)" },
]);
const key = "d".repeat(64),
  body = `Advisory AI review; does not approve or block merging.\n\n<!-- preflyt-ai:${key} -->`;
const review = {
  id: 12,
  body,
  commit_id: context.head.sha,
  state: "COMMENTED",
  user: { login: "preflyt[bot]", type: "Bot" },
  html_url: "https://github.com/org/repo/pull/1#pullrequestreview-12",
};
const comments = [
  {
    path: "src/api.ts",
    line: 1,
    side: "RIGHT",
    body: "Advisory AI suggestion\n\nInput may need validation.\n\nValidate input.",
  },
];
const receipt = {
  ...comments[0],
  id: 31,
  pull_request_review_id: 12,
  commit_id: context.head.sha,
  user: review.user,
};
const findings = [
  {
    summary: "Input may need validation.",
    recommendation: "Validate input.",
    evidenceRefs: ["diff:0"],
  },
];
function fixture() {
  const p = new GitHubProviderService() as any;
  vi.spyOn(p, "readPullRequest").mockResolvedValue({ context });
  vi.spyOn(p, "openRepository").mockResolvedValue({
    metadata: { owner: { login: "org" }, name: "repo" },
  });
  const mint = vi
    .spyOn(p, "appRequest")
    .mockImplementation(async (route: string) => ({
      data:
        route === "GET /app" ? { slug: "preflyt" } : { token: "fixture-token" },
    }));
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  return { p, fetch, mint };
}
const response = (value: unknown) => new Response(JSON.stringify(value));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("posts COMMENT feedback only on verified lines, scoped to the repository, and reads it back", async () => {
  const { p, fetch, mint } = fixture();
  fetch
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response({ id: 12 }))
    .mockResolvedValueOnce(response(review))
    .mockResolvedValueOnce(response([{ id: 31, position: 1 }]))
    .mockResolvedValueOnce(response(receipt));
  expect(
    await p.publishAiInlineReview(10n, 101n, source, key, findings),
  ).toMatchObject({ reviewId: "12" });
  expect(mint).toHaveBeenCalledWith(
    "POST /app/installations/{installation_id}/access_tokens",
    {
      installation_id: 10,
      repository_ids: [101],
      permissions: { metadata: "read", pull_requests: "write" },
    },
  );
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
    event: "COMMENT",
    commit_id: context.head.sha,
    comments,
  });
  p.close();
});
it("recovers an ambiguous write without posting duplicate comments", async () => {
  const { p, fetch } = fixture();
  fetch
    .mockResolvedValueOnce(response([review]))
    .mockResolvedValueOnce(response(review))
    .mockResolvedValueOnce(response([{ id: 31, position: 1 }]))
    .mockResolvedValueOnce(response(receipt));
  await p.publishAiInlineReview(10n, 101n, source, key, findings);
  expect(fetch.mock.calls.every((c) => c[1].method === "GET")).toBe(true);
  p.close();
});
it("does not publish evidence-only findings and rejects a changed PR", async () => {
  const { p, fetch } = fixture();
  expect(
    await p.publishAiInlineReview(10n, 101n, source, key, [
      { ...findings[0]!, evidenceRefs: ["check:0"] },
    ]),
  ).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  p.readPullRequest.mockResolvedValue({
    context: { ...context, head: { ...context.head, sha: "c".repeat(40) } },
  });
  await expect(
    p.publishAiInlineReview(10n, 101n, source, key, findings),
  ).rejects.toThrow("changed");
  expect(fetch).not.toHaveBeenCalled();
  p.close();
});

it("rejects an inline receipt from a different review without publishing another review", async () => {
  const { p, fetch } = fixture();
  fetch
    .mockResolvedValueOnce(response([review]))
    .mockResolvedValueOnce(response(review))
    .mockResolvedValueOnce(response([{ id: 31, position: 1 }]))
    .mockResolvedValueOnce(
      response({ ...receipt, pull_request_review_id: 99 }),
    );
  await expect(
    p.publishAiInlineReview(10n, 101n, source, key, findings),
  ).rejects.toThrow("comments changed");
  expect(fetch.mock.calls.every((c) => c[1].method === "GET")).toBe(true);
  p.close();
});

it("posts a PR review summary even when no line suggestions were returned", async () => {
  const {p, fetch} = fixture();
  const summary = "No advisory suggestions returned; this is not a passing engineering check.";
  const observed = {...review, body: `${summary}\n\n<!-- preflyt-ai:${key} -->`};
  fetch.mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({id:12}))
    .mockResolvedValueOnce(response(observed)).mockResolvedValueOnce(response([]));
  expect(await p.publishAiInlineReview(10n,101n,source,key,[],summary)).toMatchObject({reviewId:'12'});
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({event:'COMMENT', body:observed.body, comments:[]});
  p.close();
});
