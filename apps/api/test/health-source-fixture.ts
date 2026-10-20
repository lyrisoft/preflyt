import { createHash } from "node:crypto";
import { digest } from "../src/assessments/assessment-digest.js";
import {
  gitObjectHash,
  type NativeSourceBundle,
} from "../src/execution/native-source.js";
export function healthSourceFixture(
  sourceSha = "a".repeat(40),
  repositoryId = "51",
  code = "export const handler=()=>true\n",
) {
  const bytes = Buffer.from(code);
  const blobSha = gitObjectHash("blob", bytes);
  const treeSha = gitObjectHash(
    "tree",
    Buffer.concat([
      Buffer.from("100644 app.ts\0"),
      Buffer.from(blobSha, "hex"),
    ]),
  );
  const file = {
    path: "app.ts",
    mode: "100644" as const,
    blobSha,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
    content: bytes.toString("base64"),
  };
  const { content, ...metadata } = file;
  const manifest = {
    version: 1 as const,
    repositoryId,
    sourceSha,
    treeSha,
    tree: [
      {
        path: "app.ts",
        type: "blob" as const,
        mode: "100644" as const,
        sha: blobSha,
        size: bytes.length,
      },
    ],
    files: [metadata],
    totalBytes: bytes.length,
  };
  return {
    source: {
      ...manifest,
      files: [file],
      sourceHash: digest(manifest),
    } satisfies NativeSourceBundle,
    excludedFiles: 0,
    originalTreeSha: treeSha,
  };
}
