// Pure discovery: never import repository configuration or execute a manifest.
import path from "node:path";
export function testSettings(value = {}) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (k) => !["command", "directory", "framework"].includes(k),
    )
  )
    throw new Error("Invalid test settings");
  const command = value.command ?? "",
    directory = value.directory ?? ".",
    framework = value.framework ?? "auto";
  if (
    typeof command !== "string" ||
    command.length > 2000 ||
    /[\x00-\x08\x0b-\x1f\x7f]/.test(command) ||
    typeof directory !== "string" ||
    directory.length > 244 ||
    (directory !== "." &&
      (!/^[\w./-]+$/.test(directory) ||
        directory.split("/").some((p) => !p || p === ".." || p === "."))) ||
    !["auto", "vitest", "jest", "node"].includes(framework)
  )
    throw new Error("Invalid test settings");
  if (command && framework === "auto")
    throw new Error("Choose the test framework for a command override");
  return { command: command.trim(), directory, framework };
}
const ignored = /(?:^|\/)(?:node_modules|vendor|dist|build|coverage|\.git)\//;
function glob(pattern, directory) {
  if (typeof pattern !== "string" || pattern.startsWith("!")) return false;
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp("^" + escaped.replace(/\/$/, "") + "$").test(directory);
}
export function discoverTests(files, settings = {}) {
  settings = testSettings(settings);
  const manifests = [];
  for (const [name, text] of Object.entries(files)) {
    if (!/(?:^|\/)package\.json$/.test(name) || ignored.test(name)) continue;
    let manifest;
    try {
      manifest = JSON.parse(text);
    } catch {
      throw new Error("Invalid package manifest");
    }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
      throw new Error("Invalid package manifest");
    manifests.push({ directory: path.posix.dirname(name), manifest });
  }
  const root = manifests.find((m) => m.directory === ".")?.manifest ?? {};
  const workspaces = Array.isArray(root.workspaces)
    ? root.workspaces
    : (root.workspaces?.packages ?? []);
  // pnpm workspace patterns are read as data by the installer and passed here.
  const patterns = [...workspaces, ...(files.__workspacePatterns ?? [])];
  const selected = manifests.filter(
    (m) =>
      m.directory === "." ||
      (patterns.length
        ? patterns.some((p) => glob(p, m.directory)) &&
          !patterns.some(
            (p) =>
              typeof p === "string" &&
              p.startsWith("!") &&
              glob(p.slice(1), m.directory),
          )
        : [
            "package-lock.json",
            "npm-shrinkwrap.json",
            "pnpm-lock.yaml",
            "yarn.lock",
          ].some((lock) => Object.hasOwn(files, m.directory + "/" + lock))),
  );
  const packages = [];
  for (const item of selected) {
    const script = item.manifest.scripts?.test;
    if (
      typeof script !== "string" ||
      !script.trim() ||
      /no test specified/i.test(script)
    )
      continue;
    const dependencies = {
      ...root.devDependencies,
      ...root.dependencies,
      ...item.manifest.devDependencies,
      ...item.manifest.dependencies,
    };
    const configured = ["vitest", "jest"].filter((name) =>
      Object.keys(files).some(
        (p) =>
          path.posix.dirname(p) === item.directory &&
          path.posix.basename(p).startsWith(name + ".config."),
      ),
    );
    const matches = ["vitest", "jest"].filter((name) =>
      new RegExp("(?:^|[\\s;&|])" + name + "(?:[\\s;&|]|$)").test(script),
    );
    const framework =
      matches.length === 1
        ? matches[0]
        : /\bnode\s+.*--test\b/.test(script)
          ? "node"
          : configured.length === 1 && dependencies[configured[0]]
            ? configured[0]
            : null;
    // Workspace orchestration runs the child commands once, avoiding recursive duplication.
    if (
      item.directory === "." &&
      selected.length > 1 &&
      /(?:turbo|lerna|nx|--workspaces|--recursive|\s-r\s)/.test(script)
    )
      continue;
    packages.push({
      directory: item.directory,
      framework: framework ?? "unsupported",
      script: "test",
      command: null,
    });
  }
  if (settings.command) {
    if (!manifests.some((m) => m.directory === settings.directory))
      throw new Error("The override directory must contain package.json");
    const index = packages.findIndex((p) => p.directory === settings.directory);
    const entry = {
      directory: settings.directory,
      framework: settings.framework,
      script: null,
      command: settings.command,
    };
    if (index >= 0) packages[index] = entry;
    else packages.push(entry);
  }
  if (packages.length > 40) throw new Error("Test package limit exceeded");
  return packages.sort((a, b) => a.directory.localeCompare(b.directory));
}
export function packageManager(files, directory = ".") {
  const prefix = directory === "." ? "" : directory + "/";
  const locks = [
    ["pnpm-lock.yaml", "pnpm"],
    ["package-lock.json", "npm"],
    ["npm-shrinkwrap.json", "npm"],
    ["yarn.lock", "yarn"],
  ].filter(([name]) => Object.hasOwn(files, prefix + name));
  if (locks.length !== 1)
    return {
      manager: null,
      reason: locks.length ? "AMBIGUOUS_LOCKFILES" : "LOCKFILE_REQUIRED",
    };
  return { manager: locks[0][1], lockfile: prefix + locks[0][0] };
}
