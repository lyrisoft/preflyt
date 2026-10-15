import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHealthScanSource } from "./health-scan-source.js";
import {
  sourceLimits,
  type GitSourceEntry,
} from "../execution/native-source.js";

export class HealthGitSourceError extends Error {
  constructor(
    readonly code:
      | "GIT_UNAVAILABLE"
      | "SOURCE_FETCH_FAILED"
      | "SOURCE_FETCH_TIMED_OUT"
      | "SOURCE_FETCH_LIMIT_EXCEEDED",
  ) {
    super(code);
  }
}
export type HealthGitCommand = (
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    signal: AbortSignal;
    input?: Buffer;
    maxOutput: number;
    watchDisk?: boolean;
  },
) => Promise<Buffer>;
const diskLimit = 256 * 1024 * 1024;
const gitConfig = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "credential.helper=",
  "-c",
  "protocol.file.allow=never",
  "-c",
  "protocol.ext.allow=never",
  "-c",
  "http.followRedirects=false",
  "-c",
  "submodule.recurse=false",
  "-c",
  "pack.threads=1",
  "-c",
  "core.deltaBaseCacheLimit=32m",
  "-c",
  "http.lowSpeedLimit=1",
  "-c",
  "http.lowSpeedTime=30",
  "-c",
  "fetch.fsckObjects=true",
  "-c",
  "transfer.fsckObjects=true",
  "-c",
  "fetch.unpackLimit=1",
  "-c",
  "gc.auto=0",
];
function diskBytes(path: string): number {
  try {
    return readdirSync(path, { withFileTypes: true }).reduce((sum, entry) => {
      const item = join(path, entry.name);
      try {
        return (
          sum +
          (entry.isDirectory()
            ? diskBytes(item)
            : entry.isFile()
              ? statSync(item).size
              : 0)
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return sum;
        throw error;
      }
    }, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}
/** Fixed Git commands only. No shell, checkout, hooks, platform environment or raw stderr. */
export const runHealthGit: HealthGitCommand = (args, options) =>
  new Promise((resolve, reject) => {
    if (options.signal.aborted) {
      reject(new HealthGitSourceError("SOURCE_FETCH_TIMED_OUT"));
      return;
    }
    const child = spawn("git", [...gitConfig, ...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    const chunks: Buffer[] = [];
    let bytes = 0,
      failure: HealthGitSourceError | undefined,
      hardKill: ReturnType<typeof setTimeout> | undefined;
    const kill = () => {
      try {
        if (process.platform !== "win32" && child.pid)
          process.kill(-child.pid, "SIGTERM");
        else child.kill("SIGTERM");
      } catch {
        /* already stopped */
      }
    };
    const stop = (code: HealthGitSourceError["code"]) => {
      if (failure) return;
      failure = new HealthGitSourceError(code);
      kill();
      hardKill = setTimeout(() => {
        try {
          if (process.platform !== "win32" && child.pid)
            process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {
          /* already stopped */
        }
      }, 1000);
      hardKill.unref();
    };
    const abort = () => stop("SOURCE_FETCH_TIMED_OUT");
    options.signal.addEventListener("abort", abort, { once: true });
    const diskCheck = options.watchDisk
      ? setInterval(() => {
          try {
            if (diskBytes(options.cwd) > diskLimit)
              stop("SOURCE_FETCH_LIMIT_EXCEEDED");
          } catch {
            stop("SOURCE_FETCH_FAILED");
          }
        }, 100)
      : undefined;
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > options.maxOutput) stop("SOURCE_FETCH_LIMIT_EXCEEDED");
      else chunks.push(chunk);
    });
    child.stderr.resume(); // Never retain or expose provider stderr, URLs or authentication material.
    child.stdin.on("error", () => {});
    child.on("error", (error: NodeJS.ErrnoException) => {
      failure = new HealthGitSourceError(
        error.code === "ENOENT" ? "GIT_UNAVAILABLE" : "SOURCE_FETCH_FAILED",
      );
    });
    child.on("close", (code) => {
      options.signal.removeEventListener("abort", abort);
      if (diskCheck) clearInterval(diskCheck);
      if (hardKill) clearTimeout(hardKill);
      if (failure || code !== 0)
        reject(failure ?? new HealthGitSourceError("SOURCE_FETCH_FAILED"));
      else resolve(Buffer.concat(chunks));
    });
    child.stdin.end(options.input);
  });

/** A shallow object fetch, with no worktree or credential-bearing repository configuration. */
export async function readHealthGitSource(
  input: {
    owner: string;
    name: string;
    repositoryId: string;
    sourceSha: string;
    token: string;
    includeTestAssets?: boolean;
  },
  externalSignal?: AbortSignal,
  command: HealthGitCommand = runHealthGit,
) {
  if (
    !/^[a-zA-Z0-9_.-]+$/.test(input.owner) ||
    !/^[a-zA-Z0-9_.-]+$/.test(input.name) ||
    [".", ".."].includes(input.owner) ||
    [".", ".."].includes(input.name) ||
    !/^[1-9]\d{0,15}$/.test(input.repositoryId) ||
    !/^[a-f0-9]{40}$/.test(input.sourceSha) ||
    !input.token ||
    /[\r\n\0]/.test(input.token)
  )
    throw new HealthGitSourceError("SOURCE_FETCH_FAILED");
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, AbortSignal.timeout(10 * 60000)])
    : AbortSignal.timeout(10 * 60000);
  signal.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), "preflyt-health-git-"));
  // Do not inherit DATABASE_URL, cloud/model secrets, Git configuration or proxy helpers.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: directory,
    TMPDIR: directory,
    LANG: "C",
    LC_ALL: "C",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_LFS_SKIP_SMUDGE: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_NO_REPLACE_OBJECTS: "1",
  };
  const run = (
    args: string[],
    maxOutput = 8 * 1024 * 1024,
    body?: Buffer,
    auth = false,
  ) =>
    command(args, {
      cwd: directory,
      env: auth
        ? {
            ...env,
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: "http.https://github.com/.extraHeader",
            GIT_CONFIG_VALUE_0:
              "AUTHORIZATION: basic " +
              Buffer.from("x-access-token:" + input.token).toString("base64"),
          }
        : env,
      signal,
      input: body,
      maxOutput,
      watchDisk: auth,
    });
  try {
    await run(["init", "--bare", "--quiet", "--template=", "."]);
    const url = `https://github.com/${input.owner}/${input.name}.git`;
    await run(
      [
        "fetch",
        "--quiet",
        "--no-tags",
        "--no-recurse-submodules",
        "--depth=1",
        url,
        input.sourceSha,
      ],
      65536,
      undefined,
      true,
    );
    if (diskBytes(directory) > diskLimit)
      throw new HealthGitSourceError("SOURCE_FETCH_LIMIT_EXCEEDED");
    const commit = await run(
      ["cat-file", "commit", input.sourceSha],
      2 * 1024 * 1024,
    );
    if (
      createHash("sha1")
        .update(`commit ${commit.length}\0`)
        .update(commit)
        .digest("hex") !== input.sourceSha
    )
      throw new HealthGitSourceError("SOURCE_FETCH_FAILED");
    const treeSha = /^tree ([a-f0-9]{40})\n/.exec(commit.toString("utf8"))?.[1];
    if (!treeSha) throw new HealthGitSourceError("SOURCE_FETCH_FAILED");
    const inventory = await run(
      ["ls-tree", "-r", "-t", "-l", "-z", treeSha],
      16 * 1024 * 1024,
    );
    const text = inventory.toString("utf8");
    if (!Buffer.from(text).equals(inventory))
      throw new HealthGitSourceError("SOURCE_FETCH_FAILED");
    const entries = text
      .split("\0")
      .filter(Boolean)
      .map((line) => {
        const match =
          /^(\d{6}) (blob|tree|commit) ([a-f0-9]{40}) +(-|\d+)\t(.+)$/.exec(
            line,
          );
        if (!match) throw new HealthGitSourceError("SOURCE_FETCH_FAILED");
        return {
          mode: match[1],
          type: match[2],
          sha: match[3],
          ...(match[4] === "-" ? {} : { size: Number(match[4]) }),
          path: match[5],
        };
      });
    const request = async <T>(path: string): Promise<T> => {
      if (path.endsWith("/git/commits/" + input.sourceSha))
        return { sha: input.sourceSha, tree: { sha: treeSha } } as T;
      if (path.endsWith("/git/trees/" + treeSha + "?recursive=1"))
        return { sha: treeSha, truncated: false, tree: entries } as T;
      throw new HealthGitSourceError("SOURCE_FETCH_FAILED");
    };
    const readBlobs = async (selected: GitSourceEntry[]) => {
      const unique = [
        ...new Map(selected.map((entry) => [entry.sha, entry])).values(),
      ];
      const raw = await run(
        ["cat-file", "--batch"],
        sourceLimits.totalBytes + sourceLimits.files * 128,
        Buffer.from(
          unique.map((entry) => entry.sha).join("\n") +
            (unique.length ? "\n" : ""),
        ),
      );
      let offset = 0;
      const blobs = new Map<string, unknown>();
      for (const entry of unique) {
        const end = raw.indexOf(10, offset),
          header = raw.subarray(offset, end).toString("ascii");
        if (end < offset || header !== `${entry.sha} blob ${entry.size}`)
          throw new HealthGitSourceError("SOURCE_FETCH_FAILED");
        const start = end + 1,
          stop = start + entry.size!;
        if (stop >= raw.length || raw[stop] !== 10)
          throw new HealthGitSourceError("SOURCE_FETCH_FAILED");
        blobs.set(entry.sha, {
          sha: entry.sha,
          size: entry.size,
          encoding: "base64",
          content: raw.subarray(start, stop).toString("base64"),
        });
        offset = stop + 1;
      }
      if (offset !== raw.length)
        throw new HealthGitSourceError("SOURCE_FETCH_FAILED");
      return blobs;
    };
    return await readHealthScanSource(
      request,
      `/repos/${input.owner}/${input.name}`,
      input.repositoryId,
      input.sourceSha,
      signal,
      readBlobs,
      input.includeTestAssets,
    );
  } catch (error) {
    if (error instanceof HealthGitSourceError) throw error;
    if (signal.aborted)
      throw new HealthGitSourceError("SOURCE_FETCH_TIMED_OUT");
    if (
      error instanceof Error &&
      [
        "Repository tree exceeds safe inventory bounds",
        "Repository scan exceeds safe source bounds",
      ].includes(error.message)
    )
      throw new HealthGitSourceError("SOURCE_FETCH_LIMIT_EXCEEDED");
    throw new HealthGitSourceError("SOURCE_FETCH_FAILED");
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}
