// Dependency preparation only: no repository scripts, hooks, configuration modules or credentials.
import {
  cp,
  readFile,
  writeFile,
  readdir,
  lstat,
  rm,
  chmod,
  mkdir,
  symlink,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { parse as yaml } from "/opt/preflyt/test-tools/node_modules/yaml/dist/index.js";
import { discoverTests, packageManager } from "./discovery.mjs";
import { verifyMountedNativeSource } from "../source-verification.mjs";
const root = "/project";
const run = (cmd, args, cwd) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: "ignore",
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        HOME: "/scratch",
        TMPDIR: "/project/.preflyt-package-tmp",
        npm_config_cache: "/project/.preflyt-package-cache/npm",
        YARN_CACHE_FOLDER: "/project/.preflyt-package-cache/yarn",
        CI: "true",
        npm_config_registry: "https://registry.npmjs.org/",
        npm_config_ignore_scripts: "true",
        npm_config_audit: "false",
        npm_config_fund: "false",
        npm_config_userconfig: "/dev/null",
        npm_config_globalconfig: "/opt/preflyt/empty-npmrc",
        COREPACK_ENABLE_PROJECT_SPEC: "0",
      },
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 240000);
    child.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
const unsafeConfig =
  /^(?:\.npmrc|\.yarnrc(?:\.yml)?|\.pnpmfile\.cjs|pnpmfile\.cjs)$/;
// URL-bearing lockfile and dependency values are restricted to the public npm registry.
function publicDependencies(value, directory = ".", files = {}) {
  if (typeof value === "string") {
    if (
      /(?:https?:|git\+|git:|ssh:|github:|gitlab:|bitbucket:|file:|link:)/i.test(
        value,
      )
    ) {
      if (value.startsWith("link:") && !path.posix.isAbsolute(value.slice(5))) {
        const target = path.posix.normalize(
          path.posix.join(directory, value.slice(5)),
        );
        if (
          target !== ".." &&
          !target.startsWith("../") &&
          Object.hasOwn(files, path.posix.join(target, "package.json"))
        )
          return;
        throw new Error("Workspace dependency outside source");
      }
      let url;
      try {
        url = new URL(value);
      } catch {
        throw new Error("Unsupported dependency source");
      }
      if (
        url.protocol !== "https:" ||
        !["registry.npmjs.org", "registry.yarnpkg.com"].includes(
          url.hostname,
        ) ||
        url.port ||
        url.username ||
        url.password ||
        url.search
      )
        throw new Error("Unsupported dependency source");
    }
  } else if (Array.isArray(value))
    value.forEach((child) => publicDependencies(child, directory, files));
  else if (value && typeof value === "object")
    Object.entries(value)
      .filter(
        ([key]) =>
          ![
            "funding",
            "homepage",
            "bugs",
            "repository",
            "engines",
            "license",
            "description",
            "scripts",
            "bin",
          ].includes(key),
      )
      .forEach(([key, child]) => {
        if (key === "importers" && child && typeof child === "object")
          Object.entries(child).forEach(([relative, importer]) =>
            publicDependencies(
              importer,
              path.posix.join(directory, relative),
              files,
            ),
          );
        else publicDependencies(child, directory, files);
      });
}
let reason = "DEPENDENCY_INSTALL_FAILED";
try {
  await verifyMountedNativeSource("/workspace", {
    repositoryId: process.env.PREFLYT_SOURCE_REPOSITORY,
    sourceSha: process.env.PREFLYT_SOURCE_SHA,
    sourceHash: process.env.PREFLYT_SOURCE_HASH,
  });
  const files = {},
    manifests = new Map();
  const visit = async (dir) => {
    for (const entry of await readdir("/workspace/" + dir, {
      withFileTypes: true,
    })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) await visit(rel);
      else if (
        entry.isFile() &&
        /(?:^|\/)(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|yarn\.lock|(?:vitest|jest)\.config\.[\w]+)$/.test(
          rel,
        )
      )
        files[rel] = await readFile("/workspace/" + rel, "utf8");
    }
  };
  await visit("");
  if (files["pnpm-workspace.yaml"]) {
    const config = yaml(files["pnpm-workspace.yaml"]);
    files.__workspacePatterns = config?.packages ?? [];
  }
  const settings = JSON.parse(
    Buffer.from(
      process.env.PREFLYT_TEST_SETTINGS ?? "e30=",
      "base64",
    ).toString(),
  );
  const packages = discoverTests(files, settings);
  if (!packages.length) {
    reason = "NO_TEST_SETUP";
    throw new Error();
  }
  if (packages.some((p) => p.framework === "unsupported")) {
    reason = "UNSUPPORTED_TEST_COMMAND";
    throw new Error();
  }
  await cp("/workspace", root, {
    recursive: true,
    dereference: false,
    filter: (src) => !unsafeConfig.test(path.basename(src)),
  });
  const writable = async (directory) => {
    await chmod(directory, 0o700);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await writable(file);
      else if (entry.isFile())
        await chmod(file, (await lstat(file)).mode & 0o111 ? 0o700 : 0o600);
      else throw new Error("Unexpected source link");
    }
  };
  await writable(root);
  for (const directory of [".preflyt-package-tmp", ".preflyt-package-cache"]) {
    await rm(root + "/" + directory, { recursive: true, force: true });
    await mkdir(root + "/" + directory, { mode: 0o700 });
  }
  for (const [name, text] of Object.entries(files))
    if (name.endsWith("package.json")) {
      const original = JSON.parse(text);
      manifests.set(name, text);
      const safe = { ...original, scripts: {} };
      delete safe.pnpm;
      delete safe.packageManager;
      delete safe.devEngines;
      for (const key of [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "overrides",
        "resolutions",
      ]) {
        publicDependencies(safe[key], path.posix.dirname(name), files);
        if (key.endsWith("Dependencies") || key === "dependencies")
          for (const spec of Object.values(safe[key] ?? {})) {
            if (
              typeof spec !== "string" ||
              !/^(?:[~^<>=*0-9v]|latest$|next$|workspace:|npm:)/.test(spec)
            )
              throw new Error("Unsupported dependency source");
          }
      }
      await writeFile(root + "/" + name, JSON.stringify(safe));
    }
  const roots = [];
  for (const pkg of packages) {
    let directory = pkg.directory,
      manager;
    while (true) {
      manager = packageManager(files, directory);
      if (
        manager.manager ||
        manager.reason === "AMBIGUOUS_LOCKFILES" ||
        directory === "."
      )
        break;
      directory = path.posix.dirname(directory);
    }
    if (!manager.manager) {
      reason = manager.reason;
      throw new Error();
    }
    pkg.manager = manager.manager;
    pkg.installDirectory = directory;
    if (!roots.some((r) => r.directory === directory))
      roots.push({ ...manager, directory });
  }
  for (const setup of roots) {
    reason = "DEPENDENCY_SOURCE_UNSUPPORTED";
    const lock = files[setup.lockfile];
    if (setup.manager === "npm")
      publicDependencies(JSON.parse(lock), setup.directory, files);
    else if (setup.manager === "pnpm")
      publicDependencies(yaml(lock), setup.directory, files);
    else {
      if (!lock.startsWith("# THIS IS AN AUTOGENERATED FILE.")) {
        reason = "UNSUPPORTED_PACKAGE_MANAGER";
        throw new Error();
      }
      for (const match of lock.matchAll(
        /(?:https?|git\+https|git|ssh):[^\s"']+/g,
      ))
        publicDependencies(match[0]);
    }
    // Only workspace membership is needed during install; no pnpm execution/configuration hooks.
    if (setup.manager === "pnpm" && files["pnpm-workspace.yaml"])
      await writeFile(
        root + "/pnpm-workspace.yaml",
        JSON.stringify({ packages: files.__workspacePatterns }),
      );
    reason = "DEPENDENCY_INSTALL_FAILED";
    const args =
      setup.manager === "npm"
        ? ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]
        : setup.manager === "pnpm"
          ? [
              "install",
              "--frozen-lockfile",
              "--ignore-scripts",
              "--ignore-pnpmfile",
              "--store-dir",
              "/project/.preflyt-package-cache/pnpm",
            ]
          : [
              "install",
              "--frozen-lockfile",
              "--ignore-scripts",
              "--non-interactive",
            ];
    if (!(await run(setup.manager, args, root + "/" + setup.directory)))
      throw new Error();
  }
  // Match the coverage provider to the repository's installed Vitest version; never modify its saved manifest/lockfile.
  for (const pkg of packages.filter((p) => p.framework === "vitest")) {
    const require = createRequire(root + "/" + pkg.directory + "/package.json");
    try {
      require.resolve("@vitest/coverage-v8");
      continue;
    } catch {}
    reason = "COVERAGE_PROVIDER_UNAVAILABLE";
    const installed = require.resolve("vitest/package.json");
    if (!installed.startsWith(root + "/")) throw new Error();
    const version = JSON.parse(await readFile(installed, "utf8")).version;
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error();
    const prefix = root + "/.preflyt-coverage-tools/" + version;
    await mkdir(prefix, { recursive: true });
    await writeFile(
      prefix + "/package.json",
      JSON.stringify({
        private: true,
        dependencies: { "@vitest/coverage-v8": version },
      }),
    );
    if (
      !(await run(
        "npm",
        [
          "install",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "--package-lock=false",
        ],
        prefix,
      ))
    )
      throw new Error();
    const target = root + "/" + pkg.directory + "/node_modules/@vitest";
    await mkdir(target, { recursive: true });
    await symlink(
      prefix + "/node_modules/@vitest/coverage-v8",
      target + "/coverage-v8",
    );
  }
  for (const [name, text] of manifests)
    await writeFile(root + "/" + name, text);
  if (files["pnpm-workspace.yaml"])
    await writeFile(
      root + "/pnpm-workspace.yaml",
      files["pnpm-workspace.yaml"],
    );
  await writeFile(
    root + "/.preflyt-test-plan.json",
    JSON.stringify({ packages }),
    { mode: 0o600 },
  );
  await writeFile(
    root + "/.preflyt-install.json",
    JSON.stringify({ ready: true }),
  );
} catch {
  await writeFile(
    root + "/.preflyt-install.json",
    JSON.stringify({ ready: false, reason }),
  );
  process.exitCode = 2;
}
await writeFile("/reports/ready.json", JSON.stringify({ ready: true }), {
  flag: "wx",
});
setInterval(() => {}, 60000);
