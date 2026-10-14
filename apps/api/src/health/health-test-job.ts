import { randomUUID } from "node:crypto";
import { realpath, open } from "node:fs/promises";
import { constants } from "node:fs";
import { digest } from "../assessments/assessment-digest.js";
import {
  nativeAdapters,
  type NativeToolReview,
} from "../execution/native-plan.js";
import { nativeCheckOutcome } from "../execution/native-result.js";
import { nativeRunnerReport } from "../execution/native-runner-report.js";
import {
  nativeDockerArgs,
  verifyNativeDockerInspection,
  type DockerJobScope,
  type DockerCommand,
} from "../execution/native-docker-job.js";
import {
  validateHealthTestSettings,
  type HealthTestSettings,
} from "./health-test-settings.js";
const names = (scope: DockerJobScope) => ({
  volume: "preflyt-tests-" + scope.requestId,
  prepare: "preflyt-native-" + scope.requestId + "-tests-coverage-prepare",
  run: "preflyt-native-" + scope.requestId + "-tests-coverage",
});
export async function cleanupHealthTests(
  scope: DockerJobScope,
  tool: NativeToolReview,
  command: DockerCommand,
) {
  const n = names(scope),
    label = digest({ scope, ruleId: "tests.coverage", tool });
  for (const name of [n.run, n.prepare]) {
    const exists = (
      await command([
        "ps",
        "-a",
        "--filter",
        "name=^/" + name + "$",
        "--format",
        "{{.ID}}",
      ])
    )
      .toString()
      .trim();
    if (!exists) continue;
    const info = JSON.parse((await command(["inspect", name])).toString())[0];
    if (info?.Config?.Labels?.["preflyt.scope"] !== label)
      throw new Error("Test cleanup ownership changed");
    await command(["rm", "--force", name]);
  }
  const volumes = (
    await command([
      "volume",
      "ls",
      "--filter",
      "name=^" + n.volume + "$",
      "--format",
      "{{.Name}}",
    ])
  )
    .toString()
    .trim();
  if (volumes) {
    const info = JSON.parse(
      (await command(["volume", "inspect", n.volume])).toString(),
    )[0];
    if (info?.Labels?.["preflyt.scope"] !== label)
      throw new Error("Test volume ownership changed");
    await command(["volume", "rm", n.volume]);
  }
}
/** Preparation never executes repository code. Tests have no network, credentials or host writes. */
export async function runHealthTests(
  scope: DockerJobScope,
  tool: NativeToolReview,
  source: string,
  runtime: "runc" | "runsc" | "kata",
  settings: HealthTestSettings,
  verify: () => Promise<void>,
  command: DockerCommand,
  signal?: AbortSignal,
) {
  settings = validateHealthTestSettings(settings);
  const n = names(scope),
    label = digest({ scope, ruleId: "tests.coverage", tool }),
    startedAt = new Date().toISOString();
  const deadline = AbortSignal.any([
    ...(signal ? [signal] : []),
    AbortSignal.timeout(900000),
  ]);
  let report: Buffer | null = null,
    exitCode: number | null = null,
    reason: string | null = null,
    cleanupConfirmed = true;
  try {
    const canonical = await realpath(source);
    if (
      canonical !== source ||
      !canonical.includes("/preflyt-native-") ||
      !canonical.endsWith("/source")
    )
      throw new Error("Use a verified job workspace");
    const directory = await open(
      canonical,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    await directory.close();
    await verify();
    const existing = (
      await command([
        "volume",
        "ls",
        "--filter",
        "name=^" + n.volume + "$",
        "--format",
        "{{.Name}}",
      ])
    )
      .toString()
      .trim();
    if (existing) throw new Error("Test workspace already exists");
    await command(
      [
        "volume",
        "create",
        "--label",
        "preflyt.scope=" + label,
        "--driver",
        "local",
        "--opt",
        "type=tmpfs",
        "--opt",
        "device=tmpfs",
        "--opt",
        "o=size=2147483648,uid=65532,gid=65532,nosuid,nodev",
        n.volume,
      ],
      { signal: deadline },
    );
    const volume = JSON.parse(
      (
        await command(["volume", "inspect", n.volume], { signal: deadline })
      ).toString(),
    )[0];
    if (
      volume?.Driver !== "local" ||
      volume.Labels?.["preflyt.scope"] !== label ||
      volume.Options?.type !== "tmpfs" ||
      volume.Options?.device !== "tmpfs" ||
      volume.Options?.o !== "size=2147483648,uid=65532,gid=65532,nosuid,nodev"
    )
      throw new Error("Test volume controls changed");
    const create = async (prepare: boolean) => {
      const { args } = nativeDockerArgs(
        scope,
        "tests.coverage",
        tool,
        source,
        runtime,
        "health",
      );
      args[args.indexOf("--name") + 1] = prepare ? n.prepare : n.run;
      if (prepare) args[args.indexOf("--network") + 1] = "bridge";
      const at = args.indexOf("--entrypoint");
      args.splice(
        at,
        0,
        "--mount",
        `type=volume,source=${n.volume},target=/project`,
      );
      if (prepare) {
        args.splice(
          args.indexOf("--entrypoint"),
          0,
          "--env",
          "PREFLYT_TEST_SETTINGS=" +
            Buffer.from(JSON.stringify(settings)).toString("base64"),
        );
        args.splice(-2, 2, "/opt/preflyt/coverage/install.mjs");
      }
      const id = (await command(args, { signal: deadline })).toString().trim();
      if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid test container");
      const info = JSON.parse(
        (await command(["inspect", id], { signal: deadline })).toString(),
      )[0];
      const mount = info?.Mounts?.find(
        (m: any) => m.Destination === "/project",
      );
      if (
        !mount ||
        mount.Type !== "volume" ||
        mount.Name !== n.volume ||
        mount.RW !== true ||
        info.HostConfig.NetworkMode !== (prepare ? "bridge" : "none") ||
        info.Config.Labels?.["preflyt.scope"] !== label
      )
        throw new Error("Test controls changed");
      if (
        prepare &&
        (JSON.stringify(info.Config.Cmd) !==
          JSON.stringify(["/opt/preflyt/coverage/install.mjs"]) ||
          !info.Config.Env.includes(
            "PREFLYT_TEST_SETTINGS=" +
              Buffer.from(JSON.stringify(settings)).toString("base64"),
          ))
      )
        throw new Error("Test preparation changed");
      // Validate every common effective control after accounting for the two explicit phase differences.
      verifyNativeDockerInspection(
        {
          ...info,
          Config: {
            ...info.Config,
            Cmd: ["/opt/preflyt/runner.mjs", "tests.coverage"],
          },
          HostConfig: { ...info.HostConfig, NetworkMode: "none" },
          Mounts: info.Mounts.filter((m: any) => m.Destination !== "/project"),
        },
        scope,
        "tests.coverage",
        tool,
        source,
        runtime,
        "health",
      );
      return id;
    };
    const installer = await create(true);
    await verify();
    await command(["start", installer], { signal: deadline });
    // The installer remains alive to retain its bounded tmpfs volume between phases.
    let ready = false;
    for (let i = 0; i < 300; i++) {
      deadline.throwIfAborted();
      const result = await command(
        [
          "exec",
          installer,
          "/usr/local/bin/node",
          "-e",
          "try { process.stdout.write(require('fs').readFileSync('/reports/ready.json','utf8')) } catch {}",
        ],
        { signal: deadline },
      ).catch(() => Buffer.alloc(0));
      if (result.length) {
        JSON.parse(result.toString());
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!ready) throw new Error("Dependency preparation timed out");
    const tests = await create(false);
    await verify();
    const output = await command(["start", "--attach", tests], {
      signal: deadline,
      timeoutMs: 600000,
      maxBytes: 12 * 1024 * 1024,
    });
    exitCode = Number(
      (await command(["wait", tests], { signal: deadline })).toString().trim(),
    );
    report = nativeRunnerReport(output, scope.sourceHash, exitCode, true);
    await verify();
  } catch {
    reason = deadline.aborted
      ? "TESTS_TIMED_OUT"
      : "TEST_ENVIRONMENT_UNAVAILABLE";
  } finally {
    try {
      await cleanupHealthTests(scope, tool, command);
    } catch {
      cleanupConfirmed = false;
      reason = "CLEANUP_UNCONFIRMED";
    }
  }
  return {
    ...scope,
    ...nativeCheckOutcome("tests.coverage", exitCode, report, "health"),
    ...(reason ? { state: "INCOMPLETE" as const, reason } : {}),
    jobId: n.run,
    attemptId: randomUUID(),
    image: tool.image,
    adapterId: nativeAdapters["tests.coverage"].id,
    configHash: tool.configHash,
    toolVersion: tool.toolVersion,
    approvalHash: "",
    environmentId: "",
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode,
    cleanupConfirmed,
    report: reason ? null : (report?.toString("base64") ?? null),
  };
}
