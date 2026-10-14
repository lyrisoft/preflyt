import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  readFile,
  access,
  open,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  readHealthGitSource,
  runHealthGit,
  HealthGitSourceError,
  type HealthGitCommand,
} from "../src/health/health-git-source.js";
import { verifyNativeSourceBundle } from "../src/execution/native-source.js";
const exec = promisify(execFile);
let root: string, repo: string, sha: string;
const git = (args: string[]) =>
  exec("git", ["-C", repo, ...args], { encoding: "utf8" });
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "preflyt-git-fixture-"));
  repo = join(root, "origin");
  await mkdir(repo);
  await git(["init", "--quiet"]);
  await git(["config", "user.name", "Fixture"]);
  await git(["config", "user.email", "fixture@example.invalid"]);
  await mkdir(join(repo, "src"));
  await writeFile(join(repo, "src/app.js"), "export const count = 1;\n");
  await writeFile(join(repo, "source.dat"), Buffer.from([0, 255, 1, 128]));
  await mkdir(join(repo, "dist"));
  await writeFile(join(repo, "dist/generated.js"), "generated");
  await git(["add", "."]);
  await git(["commit", "--quiet", "-m", "first"]);
  sha = (await git(["rev-parse", "HEAD"])).stdout.trim();
  await writeFile(join(repo, "src/app.js"), "export const count = 2;\n");
  await git(["commit", "--quiet", "-am", "second"]);
});
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
const input = () => ({
  owner: "fixture",
  name: "source",
  repositoryId: "51",
  sourceSha: sha,
  token: "fixture-ephemeral-token",
});
function localRunner(
  seen: Array<{ args: string[]; env: NodeJS.ProcessEnv; cwd: string }>,
  corrupt = false,
): HealthGitCommand {
  return async (args, options) => {
    seen.push({ args, env: options.env, cwd: options.cwd });
    // Only this generated test transport permits a local source. Production rejects file URLs.
    const next =
      args[0] === "fetch"
        ? args.map((value) =>
            value.startsWith("https://github.com/") ? "file://" + repo : value,
          )
        : args;
    if (args[0] === "fetch") next.unshift("-c", "protocol.file.allow=always");
    const result = await runHealthGit(next, options);
    if (corrupt && args[0] === "cat-file" && args[1] === "--batch")
      result[result.length - 2] ^= 1;
    return result;
  };
}
it("fetches only the pinned revision, verifies binary bytes and cleans up without a checkout or API blob reads", async () => {
  const seen: Array<{ args: string[]; env: NodeJS.ProcessEnv; cwd: string }> =
    [];
  const result = await readHealthGitSource(
    input(),
    undefined,
    localRunner(seen),
  );
  expect(verifyNativeSourceBundle(result.source)).toEqual(result.source);
  expect(result.source.sourceSha).toBe(sha);
  expect(
    Buffer.from(
      result.source.files.find((f) => f.path === "src/app.js")!.content,
      "base64",
    ).toString(),
  ).toContain("count = 1");
  expect(
    Buffer.from(
      result.source.files.find((f) => f.path === "source.dat")!.content,
      "base64",
    ),
  ).toEqual(Buffer.from([0, 255, 1, 128]));
  expect(result.excludedFiles).toBe(1);
  const fetch = seen.find((call) => call.args[0] === "fetch")!;
  expect(fetch.args).toContain("--depth=1");
  expect(fetch.args).toContain(sha);
  expect(seen.some((call) => call.args.includes("checkout"))).toBe(false);
  expect(JSON.stringify(result)).not.toContain(input().token);
  expect(JSON.stringify(seen.map((call) => call.args))).not.toContain(
    input().token,
  );
  expect(fetch.env.GIT_CONFIG_VALUE_0).toContain("AUTHORIZATION: basic ");
  expect(
    seen
      .filter((call) => call.args[0] !== "fetch")
      .every((call) => !call.env.GIT_CONFIG_VALUE_0),
  ).toBe(true);
  expect(Object.keys(fetch.env)).not.toContain("DATABASE_URL");
  await expect(access(fetch.cwd)).rejects.toThrow();
});
it("keeps credentials out of on-disk Git config and refuses corrupted file bytes", async () => {
  const seen: Array<{ args: string[]; env: NodeJS.ProcessEnv; cwd: string }> =
    [];
  const run = localRunner(seen, true);
  await expect(
    readHealthGitSource(input(), undefined, async (args, options) => {
      const bytes = await run(args, options);
      if (args[0] === "fetch") {
        const config = await readFile(join(options.cwd, "config"), "utf8");
        expect(config).not.toMatch(
          /AUTHORIZATION|extraHeader|fixture-ephemeral-token|\[remote/,
        );
      }
      return bytes;
    }),
  ).rejects.toThrow();
  await expect(access(seen[0].cwd)).rejects.toThrow();
});
it("propagates only safe fetch failure codes and cleans its disposable object store", async () => {
  let directory = "";
  await expect(
    readHealthGitSource(input(), undefined, async (_args, options) => {
      directory = options.cwd;
      throw new HealthGitSourceError("GIT_UNAVAILABLE");
    }),
  ).rejects.toMatchObject({ code: "GIT_UNAVAILABLE" });
  await expect(access(directory)).rejects.toThrow();
});
it("rejects invalid repository or revision inputs and aborts before commands run", async () => {
  for (const patch of [
    { owner: "evil/host" },
    { name: "../other" },
    { sourceSha: "main" },
    { repositoryId: "0" },
    { token: "bad\nheader" },
  ])
    await expect(
      readHealthGitSource({ ...input(), ...patch }),
    ).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await expect(
    readHealthGitSource(input(), controller.signal, async () => {
      called = true;
      return Buffer.alloc(0);
    }),
  ).rejects.toThrow();
  expect(called).toBe(false);
});
it("enforces bounded subprocess output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "preflyt-git-output-"));
  try {
    await expect(
      runHealthGit(["--version"], {
        cwd: directory,
        env: { PATH: process.env.PATH },
        signal: AbortSignal.timeout(10000),
        maxOutput: 1,
      }),
    ).rejects.toMatchObject({ code: "SOURCE_FETCH_LIMIT_EXCEEDED" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("rejects an oversized temporary object store before reading source and removes it", async () => {
  let directory = "";
  await expect(
    readHealthGitSource(input(), undefined, async (args, options) => {
      directory = options.cwd;
      if (args[0] === "fetch") {
        const file = await open(join(directory, "oversized-pack"), "w");
        try {
          await file.truncate(256 * 1024 * 1024 + 1);
        } finally {
          await file.close();
        }
      }
      return Buffer.alloc(0);
    }),
  ).rejects.toMatchObject({ code: "SOURCE_FETCH_LIMIT_EXCEEDED" });
  await expect(access(directory)).rejects.toThrow();
});
