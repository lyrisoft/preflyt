import { expect, it, vi, afterEach } from "vitest";
import { GitHubProviderService } from "../src/github/github-provider.service.js";
import {
  inlineIssues,
  conciseReviewSummary,
} from "../src/intelligence/pr-review-feedback.js";
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
  body = `Advisory AI review; does not approve or block merging.\n\n<!-- preflyt-inline-v2 -->\n<!-- preflyt-ai:${key} -->`;
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
    body: inlineIssues(source, [
      {
        summary: "Unvalidated input reaches the SQL query.",
        recommendation: "Bind the input as a SQL parameter.",
        evidenceRefs: ["diff:0"],
      },
    ])[0]!.body,
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
    summary: "Unvalidated input reaches the SQL query.",
    recommendation: "Bind the input as a SQL parameter.",
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
  const { p, fetch } = fixture();
  const summary =
    "No advisory suggestions returned; this is not a passing engineering check.";
  const observed = {
    ...review,
    body: `${summary}\n\n<!-- preflyt-inline-v2 -->\n<!-- preflyt-ai:${key} -->`,
  };
  fetch
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response({ id: 12 }))
    .mockResolvedValueOnce(response(observed))
    .mockResolvedValueOnce(response([]));
  expect(
    await p.publishAiInlineReview(10n, 101n, source, key, [], summary),
  ).toMatchObject({ reviewId: "12" });
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
    event: "COMMENT",
    body: observed.body,
    comments: [],
  });
  p.close();
});

// Capture the real GitHub request payload and simulate persisted read-back receipts.
function publishingFixture(
  prSource = source,
  priorReviews: any[] = [],
  priorComments: any[] = [],
) {
  const f = fixture();
  f.p.readPullRequest.mockResolvedValue({ context: prSource.context });
  let posted: any;
  f.fetch.mockImplementation(async (url: string, init: any) => {
    if (init.method === "POST") {
      posted = JSON.parse(init.body);
      return response({ id: 12 });
    }
    if (url.endsWith("/reviews?per_page=100&page=1"))
      return response(priorReviews);
    if (url.endsWith("/comments?per_page=100&page=1"))
      return response(priorComments);
    if (url.endsWith("/reviews/12"))
      return response({
        ...review,
        body: posted.body,
        commit_id: prSource.context.head.sha,
      });
    if (url.endsWith("/reviews/12/comments?per_page=100"))
      return response(
        posted.comments.map((_: any, i: number) => ({ id: 100 + i })),
      );
    const id = Number(url.split("/").at(-1));
    return response({
      ...posted.comments[id - 100],
      id,
      pull_request_review_id: 12,
      commit_id: prSource.context.head.sha,
      user: review.user,
    });
  });
  return { ...f, posted: () => posted };
}
it("filters no-change observations, caps publication at five and bounds comment length", async () => {
  const manySource = prReviewSource(1, context, [
    {
      filename: "src/api.ts",
      patch:
        "@@ -0,0 +1,8 @@\n" +
        Array.from({ length: 8 }, (_, i) => `+query${i}(input)`).join("\n"),
    },
  ]);
  const f = publishingFixture(manySource);
  const noisy = [
    { ...findings[0]!, recommendation: "No change required." },
    ...Array.from({ length: 8 }, (_, i) => ({
      summary:
        `Unvalidated input reaches query${i} and leaks records. ` +
        "A confirmed input defect. ".repeat(15),
      recommendation:
        "Bind user input instead of interpolating SQL. " +
        "Use query parameters. ".repeat(15),
      evidenceRefs: [`diff:${i}`],
    })),
  ];
  await f.p.publishAiInlineReview(
    10n,
    101n,
    manySource,
    key,
    noisy,
    conciseReviewSummary(1, context.head.sha, 8),
  );
  expect(f.posted().comments).toHaveLength(5);
  expect(
    f
      .posted()
      .comments.every(
        (c: any) =>
          c.body.length < 700 && !c.body.includes("No change required"),
      ),
  ).toBe(true);
  expect(f.posted().body.length).toBeLessThan(400);
  f.p.close();
});
it("deduplicates an already published issue after a new commit and line shifts", async () => {
  const next = prReviewSource(
    1,
    { ...context, head: { ...context.head, sha: "e".repeat(40) } },
    [{ filename: "src/api.ts", patch: "@@ -0,0 +50 @@\n+handle(input)" }],
  );
  const prior = { ...review, id: 9, commit_id: context.head.sha };
  const old = inlineIssues(source, findings)[0]!;
  const f = publishingFixture(
    next,
    [prior],
    [
      {
        ...old,
        user: review.user,
        pull_request_review_id: 9,
        commit_id: context.head.sha,
      },
    ],
  );
  await f.p.publishAiInlineReview(
    10n,
    101n,
    next,
    "f".repeat(64),
    findings,
    conciseReviewSummary(1, next.context.head.sha, 1),
  );
  expect(f.posted().comments).toEqual([]);
  f.p.close();
});
it("deduplicates legacy bot comments and does not trust another actor's matching comment", async () => {
  const prior = { ...review, id: 9, commit_id: "e".repeat(40) };
  const legacy = {
    path: "src/api.ts",
    body: "Advisory AI suggestion\n\nUnvalidated input reaches the SQL query.\n\nBind the input as a SQL parameter.",
    user: review.user,
    pull_request_review_id: 9,
    commit_id: prior.commit_id,
  };
  const f = publishingFixture(source, [prior], [legacy]);
  await f.p.publishAiInlineReview(
    10n,
    101n,
    source,
    key,
    findings,
    conciseReviewSummary(1, context.head.sha, 1),
  );
  expect(f.posted().comments).toEqual([]);
  f.p.close();
  const other = publishingFixture(
    source,
    [prior],
    [{ ...legacy, user: { login: "someone", type: "User" } }],
  );
  await other.p.publishAiInlineReview(10n, 101n, source, key, findings);
  expect(other.posted().comments).toHaveLength(1);
  other.p.close();
});
it("shares the five-comment cap across review skills on the same PR commit", async () => {
  const prior = {
    ...review,
    id: 9,
    body: `Earlier skill\n<!-- preflyt-ai:${"e".repeat(64)} -->`,
  };
  const old = Array.from({ length: 5 }, (_, i) => ({
    path: `src/other${i}.ts`,
    body: "A different issue",
    user: review.user,
    pull_request_review_id: 9,
    commit_id: context.head.sha,
  }));
  const f = publishingFixture(source, [prior], old);
  await f.p.publishAiInlineReview(
    10n,
    101n,
    source,
    key,
    findings,
    conciseReviewSummary(1, context.head.sha, 1),
  );
  expect(f.posted().comments).toEqual([]);
  f.p.close();
});
it("does not post when cross-commit history cannot be read", async () => {
  const f = fixture();
  f.fetch
    .mockResolvedValueOnce(
      response([{ ...review, id: 9, commit_id: "e".repeat(40) }]),
    )
    .mockResolvedValueOnce(new Response("Unavailable", { status: 403 }));
  await expect(
    f.p.publishAiInlineReview(10n, 101n, source, key, findings),
  ).rejects.toThrow("unavailable");
  expect(f.fetch.mock.calls.every((c) => c[1].method === "GET")).toBe(true);
  f.p.close();
});

it("counts comments on their original publication commit after GitHub moves diff anchors", async () => {
  const prior = { ...review, id: 9, commit_id: "e".repeat(40) };
  const old = Array.from({ length: 5 }, (_, i) => ({
    path: `src/other${i}.ts`,
    body: "A different issue",
    user: review.user,
    pull_request_review_id: 9,
    commit_id: context.head.sha,
    original_commit_id: prior.commit_id,
  }));
  const f = publishingFixture(source, [prior], old);
  await f.p.publishAiInlineReview(10n, 101n, source, key, findings);
  expect(f.posted().comments).toHaveLength(1);
  f.p.close();
});
