import { digest } from "../assessments/assessment-digest.js";
import type { NativeToolReview } from "../execution/native-plan.js";
import type { DockerJobScope, DockerCommand } from "../execution/native-docker-job.js";
// Cleanup only for jobs created before Repository Health stopped executing tests.
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
