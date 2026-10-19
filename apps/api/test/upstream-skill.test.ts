import { expect, it, vi, beforeEach } from "vitest";
import { readUpstreamSkill } from "../src/intelligence/upstream-skill.js";
const request = vi.hoisted(() => vi.fn());
vi.mock("../src/intelligence/ai-http.js", () => ({ aiHttpRequest: request }));
const input = {
  repository: "example/reviews",
  commit: "a".repeat(40),
  path: "SKILL.md",
  licensePath: "LICENSE",
};
const text =
  "---\nname: Input review\ndescription: Review inputs\n---\n\nInspect supplied changes. Cite evidence.";
beforeEach(() => request.mockReset());
it("pins upstream bytes and license without fetching scripts or assigning authority", async () => {
  request
    .mockResolvedValueOnce(new Response(text))
    .mockResolvedValueOnce(new Response("MIT License"));
  const result = await readUpstreamSkill(input);
  expect(result.manifest.source).toContain(input.commit);
  expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(result.manifest.license).toBe("");
  expect(request.mock.calls.map((c) => c[0].hostname)).toEqual([
    "raw.githubusercontent.com",
    "raw.githubusercontent.com",
  ]);
  expect(request.mock.calls[0][2]).not.toHaveProperty("body");
});
it.each([
  { ...input, commit: "main" },
  { ...input, path: "../SKILL.md" },
  { ...input, repository: "http://localhost/private" },
  { ...input, path: "setup.sh" },
])("rejects unpinned or executable source before fetching", async (value) => {
  await expect(readUpstreamSkill(value)).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it("rejects unsupported executable metadata and oversized instructions", async () => {
  request
    .mockResolvedValueOnce(
      new Response(text.replace("name:", "tools: [shell]\nname:")),
    )
    .mockResolvedValueOnce(new Response("MIT"));
  await expect(readUpstreamSkill(input)).rejects.toThrow("unsupported");
  request.mockReset().mockResolvedValueOnce(new Response("x".repeat(131073)));
  await expect(readUpstreamSkill(input)).rejects.toThrow("128 KiB");
});
