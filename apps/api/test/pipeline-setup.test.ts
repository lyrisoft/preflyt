import { describe, expect, it } from "vitest";
import { gunzipSync } from "node:zlib";
import { setupArchive } from "../src/assessments/pipeline-setup.controller.js";

describe("workflow setup archive", () => {
  it("preserves fixed Action paths and contents in a tar archive", () => {
    const name = ".github/actions/preflyt-policy/action.yml";
    const content = "name: Preflyt\n";
    const tar = gunzipSync(
      Buffer.from(setupArchive({ [name]: content }), "base64"),
    );
    expect(tar.subarray(0, 100).toString().replace(/\0.*$/, "")).toBe(name);
    expect(tar.subarray(512, 512 + Buffer.byteLength(content)).toString()).toBe(
      content,
    );
    expect(tar.subarray(-1024).every((byte) => byte === 0)).toBe(true);
  });
  it("rejects path traversal and absolute filenames", () => {
    for (const path of ["../action.yml", "/action.yml", "x/../action.yml"])
      expect(() => setupArchive({ [path]: "unsafe" })).toThrow();
  });
});
