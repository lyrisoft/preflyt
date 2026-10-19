import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { HealthSourceStore } from "../src/health/health-source-store.js";
import { healthSourceFixture } from "./health-source-fixture.js";
let directory: string, store: HealthSourceStore, owner: any;
const key = Buffer.alloc(32, 1);
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "preflyt-source-test-"));
  store = new HealthSourceStore(directory, key);
  owner = {
    id: randomUUID(),
    organizationId: "org",
    repositoryId: "repo",
    sourceSha: "a".repeat(40),
    plan: {},
  };
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
it("persists encrypted verified source for a different worker instance and removes it explicitly", async () => {
  const input = healthSourceFixture();
  owner.plan.sharedSource = await store.save(owner, input);
  owner.plan.sharedSource = Object.fromEntries(
    Object.entries(owner.plan.sharedSource).reverse(),
  );
  const bytes = await readFile(join(directory, owner.id + ".source"));
  expect(bytes.includes(Buffer.from("handler"))).toBe(false);
  expect(await new HealthSourceStore(directory, key).read(owner)).toEqual(
    input,
  );
  await store.remove(owner.id);
  await expect(store.read(owner)).rejects.toThrow();
});
it("rejects another organization, repository, commit, export policy or expired snapshot", async () => {
  owner.plan.sharedSource = await store.save(owner, healthSourceFixture());
  for (const patch of [
    { organizationId: "other" },
    { repositoryId: "other" },
    { sourceSha: "c".repeat(40) },
  ])
    await expect(store.read({ ...owner, ...patch })).rejects.toThrow();
  await expect(
    store.read({
      ...owner,
      plan: {
        sharedSource: { ...owner.plan.sharedSource, exportVersion: "other" },
      },
    }),
  ).rejects.toThrow();
  await expect(
    store.read({
      ...owner,
      plan: {
        sharedSource: {
          ...owner.plan.sharedSource,
          expiresAt: new Date(0).toISOString(),
        },
      },
    }),
  ).rejects.toThrow();
});
it("rejects tampered ciphertext, mismatched keys and unsafe file permissions", async () => {
  owner.plan.sharedSource = await store.save(owner, healthSourceFixture());
  await expect(
    new HealthSourceStore(directory, Buffer.alloc(32, 2)).read(owner),
  ).rejects.toThrow();
  const path = join(directory, owner.id + ".source"),
    bytes = await readFile(path);
  bytes[20] ^= 1;
  await writeFile(path, bytes);
  await expect(store.read(owner)).rejects.toThrow();
  await chmod(path, 0o644);
  await expect(store.read(owner)).rejects.toThrow();
});
it("prunes expired scratch and refuses unverified source", async () => {
  owner.plan.sharedSource = await store.save(owner, healthSourceFixture());
  const path = join(directory, owner.id + ".source"),
    old = new Date(Date.now() - 5 * 3600000);
  await utimes(path, old, old);
  await store.prune();
  await expect(readFile(path)).rejects.toThrow();
  await expect(
    store.save(owner, {
      ...healthSourceFixture(),
      source: { ...healthSourceFixture().source, sourceHash: "0".repeat(64) },
    }),
  ).rejects.toThrow();
});
