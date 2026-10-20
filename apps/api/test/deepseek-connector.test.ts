import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";
import { deepSeekConnectorFiles } from "../src/mcp/deepseek-connector.js";

let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});
it("loads the actual generated connector with DSH's runtime, fixed OAuth scopes and an installed pinned bridge", async () => {
  directory = await mkdtemp(join(tmpdir(), "preflyt-dsh-"));
  const resource = "https://preflyt.example/prefix/api/mcp";
  const files = deepSeekConnectorFiles(resource);
  for (const [file, content] of Object.entries(files)) {
    const target = join(directory, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  const root = join(directory, "package");
  const bridge = join(root, "node_modules/mcp-remote/dist/proxy.js");
  await mkdir(dirname(bridge), { recursive: true });
  await writeFile(
    bridge,
    "// Fixture only: must never execute during configuration.",
  );
  const module = await import(
    /* @vite-ignore */ pathToFileURL(join(root, "index.mjs")).href
  );
  const loaded: string[] = [];
  const context = {
    loader: {
      async import(name: string) {
        loaded.push(name);
        return {
          Config: (config: unknown) => config,
          apply: async (ctx: unknown, config: unknown) => ({ ctx, config }),
        };
      },
    },
  };
  const { ctx, config } = await module.apply(context);
  expect(module.inject).toEqual(["tools", "loader"]);
  expect(loaded).toEqual(["@deepseek-ai/dsh-mcp-client"]);
  expect(ctx).toBe(context);
  expect(config.command).toBe(process.execPath);
  expect(config.args.slice(0, 2)).toEqual([await realpath(bridge), resource]);
  expect(config.args[config.args.indexOf("--resource") + 1]).toBe(resource);
  expect(config.args[config.args.indexOf("--transport") + 1]).toBe("http-only");
  expect(JSON.parse(config.args.at(-1))).toEqual({
    client_name: "DeepSeek Harness",
    scope: "findings:read findings:review",
  });
  expect(config.env).toEqual({ ELECTRON_RUN_AS_NODE: "1" });
  const manifest = JSON.parse(files["package/package.json"]);
  expect(manifest.dependencies).toEqual({ "mcp-remote": "0.1.38" });
  expect(manifest.scripts).toBeUndefined();
  expect(manifest.name).not.toBe(
    JSON.parse(
      deepSeekConnectorFiles("https://other.example/mcp")[
        "package/package.json"
      ],
    ).name,
  );
});
