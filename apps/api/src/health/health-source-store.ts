import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyNativeSourceBundle } from "../execution/native-source.js";
import type { GitHubProviderService } from "../github/github-provider.service.js";

type ScanSource = Awaited<
  ReturnType<GitHubProviderService["readHealthScanSource"]>
>;
type Owner = {
  id: string;
  organizationId: string;
  repositoryId: string;
  sourceSha: string | null;
  plan: unknown;
};
export type SharedSource = {
  version: 1;
  exportVersion: "health-source-v1";
  sourceSha: string;
  sourceHash: string;
  expiresAt: string;
};
const ttl = 4 * 3600000;
const maxBytes = 100 * 1024 * 1024;
const uuid = /^[a-f0-9]{8}-[a-f0-9-]{27}$/;
const unavailable = () => new Error("HEALTH_SHARED_SOURCE_UNAVAILABLE");

/** Worker-only encrypted scratch. Neither database records nor queue payloads contain source. */
export class HealthSourceStore {
  constructor(
    private directory = process.env.HEALTH_SOURCE_DIRECTORY ??
      join(tmpdir(), "preflyt-health-sources"),
    private encryptionKey?: Buffer,
  ) {}
  private key() {
    const key =
      this.encryptionKey ??
      Buffer.from(process.env.CONFIGURATION_ENCRYPTION_KEY ?? "", "base64");
    if (key.length !== 32) throw unavailable();
    return Buffer.from(
      hkdfSync(
        "sha256",
        key,
        "preflyt-health-source-v1",
        "temporary-source",
        32,
      ),
    );
  }
  private path(id: string) {
    if (!uuid.test(id)) throw unavailable();
    return join(this.directory, id + ".source");
  }
  private aad(owner: Owner, meta: SharedSource) {
    return Buffer.from(
      JSON.stringify([
        owner.organizationId,
        owner.repositoryId,
        owner.id,
        meta.version,
        meta.exportVersion,
        meta.sourceSha,
        meta.sourceHash,
        meta.expiresAt,
      ]),
    );
  }
  private async root() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(this.directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.mode & 0o077 ||
      (process.getuid && stat.uid !== process.getuid())
    )
      throw unavailable();
  }
  async save(owner: Owner, value: ScanSource): Promise<SharedSource> {
    await this.root();
    const key = this.key();
    const source = verifyNativeSourceBundle(value.source);
    if (
      owner.sourceSha !== source.sourceSha ||
      !Number.isSafeInteger(value.excludedFiles) ||
      value.excludedFiles < 0
    )
      throw unavailable();
    const meta: SharedSource = {
      version: 1,
      exportVersion: "health-source-v1",
      sourceSha: source.sourceSha,
      sourceHash: source.sourceHash,
      expiresAt: new Date(Date.now() + ttl).toISOString(),
    };
    const body = Buffer.from(
      JSON.stringify({
        source,
        excludedFiles: value.excludedFiles,
        originalTreeSha: value.originalTreeSha,
      }),
    );
    if (body.length > maxBytes) throw unavailable();
    await this.prune();
    let retained = 0;
    for (const name of await readdir(this.directory))
      if (name.endsWith(".source"))
        retained += (await lstat(join(this.directory, name))).size;
    if (retained + body.length > 512 * 1024 * 1024) throw unavailable();
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(this.aad(owner, meta));
    const encrypted = Buffer.concat([
      iv,
      cipher.update(body),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    const file = await open(
      this.path(owner.id),
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(encrypted);
      await file.sync();
    } catch (error) {
      await this.remove(owner.id);
      throw error;
    } finally {
      await file.close();
    }
    return meta;
  }
  async read(owner: Owner): Promise<ScanSource> {
    try {
      return await this.readVerified(owner);
    } catch {
      throw unavailable();
    }
  }
  private async readVerified(owner: Owner): Promise<ScanSource> {
    const meta = (owner.plan as any)?.sharedSource as SharedSource | undefined;
    if (
      !meta ||
      meta.version !== 1 ||
      meta.exportVersion !== "health-source-v1" ||
      meta.sourceSha !== owner.sourceSha ||
      !/^[a-f0-9]{64}$/.test(meta.sourceHash) ||
      !Number.isFinite(Date.parse(meta.expiresAt)) ||
      Date.parse(meta.expiresAt) <= Date.now()
    )
      throw unavailable();
    await this.root();
    const file = await open(
      this.path(owner.id),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.size < 28 ||
        stat.size > maxBytes + 28 ||
        stat.mode & 0o077 ||
        (process.getuid && stat.uid !== process.getuid())
      )
        throw unavailable();
      const bytes = await file.readFile(),
        decipher = createDecipheriv(
          "aes-256-gcm",
          this.key(),
          bytes.subarray(0, 12),
        );
      decipher.setAAD(this.aad(owner, meta));
      decipher.setAuthTag(bytes.subarray(-16));
      const value = JSON.parse(
        Buffer.concat([
          decipher.update(bytes.subarray(12, -16)),
          decipher.final(),
        ]).toString(),
      );
      const source = verifyNativeSourceBundle(value.source);
      if (
        source.sourceSha !== meta.sourceSha ||
        source.sourceHash !== meta.sourceHash ||
        !Number.isSafeInteger(value.excludedFiles) ||
        value.excludedFiles < 0
      )
        throw unavailable();
      return {
        source,
        excludedFiles: value.excludedFiles,
        originalTreeSha: value.originalTreeSha,
      };
    } finally {
      await file.close();
    }
  }
  async remove(id: string) {
    await rm(this.path(id), { force: true });
  }
  async prune() {
    await this.root();
    for (const name of await readdir(this.directory)) {
      if (!/^[a-f0-9-]{36}\.source$/.test(name)) continue;
      const path = join(this.directory, name),
        stat = await lstat(path);
      if (stat.mtimeMs < Date.now() - ttl) await rm(path, { force: true });
    }
  }
}
