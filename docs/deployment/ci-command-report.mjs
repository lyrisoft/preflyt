// Run from reviewed, pinned CI workflow code. Never accept executable/argv from Preflyt model output.
import { spawn } from "node:child_process";
import { writeFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, dirname, join } from "node:path";

const [control, output, separator, command, ...args] = process.argv.slice(2);
const supported = new Set(["types.required", "build.required"]);
const xml = (value) =>
  value.replace(
    /[<>&"']/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[character],
  );
if (
  !supported.has(control) ||
  !output ||
  separator !== "--" ||
  !command ||
  !command.startsWith("/") ||
  args.length > 64
) {
  process.stderr.write(
    "Usage: node ci-command-report.mjs <types.required|build.required> <report.xml> -- <absolute executable> [arguments]\n",
  );
  process.exitCode = 2;
} else {
  const target = resolve(output);
  const temporary = join(
    dirname(target),
    `.preflyt-report-${randomUUID()}.xml`,
  );
  let timedOut = false;
  let unavailable = false;
  const child = spawn(command, args, { stdio: "inherit", shell: false });
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, 285000);
  child.on("error", () => {
    unavailable = true;
  });
  child.once("close", async (code, signal) => {
    clearTimeout(timer);
    const incomplete =
      timedOut || unavailable || signal !== null || code === null;
    const passed = !incomplete && code === 0;
    const outcome = passed ? "" : '<failure message="Command failed"/>';
    const report = `<?xml version="1.0" encoding="UTF-8"?><testsuite name="${xml(control)}" tests="${incomplete ? 0 : 1}" failures="${!incomplete && !passed ? 1 : 0}" errors="0">${incomplete ? "" : `<testcase name="${xml(control)}">${outcome}</testcase>`}</testsuite>`;
    try {
      await writeFile(temporary, report, { flag: "wx", mode: 0o600 });
      await rename(temporary, target);
      process.exitCode = passed ? 0 : incomplete ? 2 : 1;
    } catch {
      await unlink(temporary).catch(() => {});
      process.stderr.write("Could not save command report\n");
      process.exitCode = 2;
    }
  });
}
