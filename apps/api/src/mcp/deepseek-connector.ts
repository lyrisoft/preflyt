import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

const license = readFileSync(
  new URL("../../resources/preflyt-deepseek-LICENSE.txt", import.meta.url),
  "utf8",
);

export const deepSeekConnectorPath =
  "mcp-setup/deepseek/preflyt-connector-1.0.0.tgz";

/** Public installation package: deployment URL and pinned packages, no credentials. */
export function deepSeekConnectorFiles(resource: string) {
  const name = `@preflyt/deepseek-${createHash("sha256").update(resource).digest("hex").slice(0, 12)}`;
  return {
    "package/LICENSE": license,
    "package/NOTICE":
      "Preflyt connector\nCopyright 2026 Lyrisoft Technologies Limited\nOriginal connector code is licensed under Apache-2.0. Dependencies retain their own licenses.\n",
    "package/package.json": JSON.stringify(
      {
        name,
        version: "1.0.0",
        type: "module",
        license: "Apache-2.0",
        description:
          "Connect DeepSeek Harness to Preflyt findings and review evidence.",
        exports: {
          ".": "./index.mjs",
          "./locale/*.json": "./locale/*.json",
          "./icon": "./icon.svg",
        },
        dsh: { bundle: { patch: "./cordis.patch.yml" } },
        dependencies: {
          "mcp-remote": "0.1.38",
        },
      },
      null,
      2,
    ),
    "package/cordis.patch.yml": [
      "- insert:",
      `    - id: preflyt-${name.split("-").at(-1)}`,
      `      name: ${JSON.stringify(name)}`,
    ].join("\n"),
    // DSH already runs Node/Electron. Use that runtime and the installed bridge;
    // no shell, npx, separately installed Node, or global install is needed.
    "package/index.mjs": [
      "import { createRequire } from 'node:module';",
      "const require = createRequire(import.meta.url);",
      "export const name = 'preflyt-mcp';",
      "export const inject = ['tools', 'loader'];",
      "export async function apply(ctx) {",
      "  const mcp = await ctx.loader.import('@deepseek-ai/dsh-mcp-client');",
      "  return mcp.apply(ctx, mcp.Config({",
      "    serverName: 'preflyt', transport: 'stdio', command: process.execPath,",
      `    args: [require.resolve('mcp-remote/dist/proxy.js'), ${JSON.stringify(resource)},`,
      `      '--transport', 'http-only', '--host', '127.0.0.1', '--resource', ${JSON.stringify(resource)},`,
      "      '--auth-timeout', '180', '--static-oauth-client-metadata',",
      `      ${JSON.stringify(JSON.stringify({ client_name: "DeepSeek Harness", scope: "findings:read findings:review" }))}],`,
      "    env: { ELECTRON_RUN_AS_NODE: '1' },",
      "    toolCallTimeoutMs: 60000, failOnStartupError: true,",
      "  }));",
      "}",
    ].join("\n"),
    "package/locale/en.json": JSON.stringify({
      meta: {
        title: "Preflyt",
        description:
          "Read saved findings and source code, and submit review evidence with your approved repository access.",
      },
    }),
    "package/icon.svg":
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4475db" stroke-width="1.8"><path d="M12 2 3.5 6v6c0 5 8.5 10 8.5 10s8.5-5 8.5-10V6L12 2Z"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
  };
}

/** USTAR archive of our fixed filenames; never accepts user files or filenames. */
export function deepSeekConnectorArchive(resource: string) {
  const blocks: Buffer[] = [];
  for (const [path, text] of Object.entries(deepSeekConnectorFiles(resource))) {
    const body = Buffer.from(text),
      header = Buffer.alloc(512);
    header.write(path, 0, 100);
    const octal = (value: number, offset: number, length: number) =>
      header.write(
        value.toString(8).padStart(length - 1, "0") + "\0",
        offset,
        length,
      );
    octal(0o644, 100, 8);
    octal(0, 108, 8);
    octal(0, 116, 8);
    octal(body.length, 124, 12);
    octal(0, 136, 12);
    header.fill(32, 148, 156);
    header.write("0", 156);
    header.write("ustar\0", 257);
    header.write("00", 263);
    const checksum = header.reduce((sum, value) => sum + value, 0);
    header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}
