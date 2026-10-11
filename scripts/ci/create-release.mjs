import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { images } from './publish-release.mjs';

const versionParts = name => /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(name)?.slice(1).map(BigInt);
export function releaseVersion(tags, sha) {
  const stable = tags.filter(tag => versionParts(tag.name));
  const compare = (a, b) => {
    const x = versionParts(a.name), y = versionParts(b.name);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? -1 : 1;
    return 0;
  };
  stable.sort(compare);
  const existing = stable.find(tag => tag.sha === sha);
  if (existing) return { version: existing.name, reserved: true };
  if (!stable.length) return { version: 'v0.1.0', reserved: false };
  const [major, minor, patch] = versionParts(stable[0].name);
  return { version: `v${major}.${minor}.${patch + 1n}`, reserved: false };
}
const missing = error => /HTTP 404|manifest unknown|not found/i.test(String(error.stderr ?? ''));
export function createRelease(env, run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) {
  const { GITHUB_SHA: sha, GITHUB_REPOSITORY: repository, GITHUB_REPOSITORY_OWNER: owner, GITHUB_REF: ref, GITHUB_EVENT_NAME: event } = env;
  if (ref !== 'refs/heads/main' || event !== 'push') throw new Error('Releases require a push to main');
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || !/^[a-zA-Z0-9-]+$/.test(owner ?? '') || repository !== `${owner}/preflyt`) throw new Error('Invalid release identity');
  const api = (endpoint, ...args) => run('gh', ['api', `repos/${repository}/${endpoint}`, ...args]);
  const tags = api('tags', '--paginate', '--jq', '.[] | {name, sha: .commit.sha}').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const { version, reserved } = releaseVersion(tags, sha);
  const docker = args => run('docker', ['buildx', 'imagetools', ...args]);
  const raw = image => docker(['inspect', '--raw', image]);
  const digest = image => {
    const value = docker(['inspect', '--format', '{{.Manifest.Digest}}', image]).trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error('Invalid registry manifest digest');
    return value;
  };
  const sources = [];
  // Verify every source before reserving a version or changing registry tags.
  for (const image of Object.keys(images)) {
    const base = `ghcr.io/${owner}/${image}`;
    const source = `${base}:sha-${sha}`;
    const content = raw(source);
    const platforms = new Set((JSON.parse(content).manifests ?? []).map(item => `${item.platform?.os}/${item.platform?.architecture}`));
    if (!platforms.has('linux/amd64') || !platforms.has('linux/arm64')) throw new Error(`Missing release architecture for ${image}`);
    sources.push({ base, sourceDigest: digest(source), target: `${base}:${version}` });
  }
  if (!reserved) api('git/refs', '--method', 'POST', '-f', `ref=refs/tags/${version}`, '-f', `sha=${sha}`);
  for (const { base, sourceDigest, target } of sources) {
    let existing;
    try { existing = digest(target); } catch (error) { if (!missing(error)) throw error; }
    if (existing !== undefined && existing !== sourceDigest) throw new Error(`Refusing to overwrite release image ${target}`);
    if (existing === undefined) docker(['create', '-t', target, `${base}@${sourceDigest}`]);
    if (digest(target) !== sourceDigest) throw new Error(`Release image digest mismatch for ${target}`);
  }
  let release;
  try { release = JSON.parse(api(`releases/tags/${version}`)); } catch (error) { if (!/HTTP 404/.test(String(error.stderr ?? ''))) throw error; }
  if (release?.draft || release?.prerelease) throw new Error('Existing release is not a published stable release');
  if (!release) run('gh', ['release', 'create', version, '--repo', repository, '--verify-tag', '--title', `Preflyt ${version}`, '--generate-notes', '--notes', `All application images use ${version} and sha-${sha}. Both linux/amd64 and linux/arm64 are available.`]);
  return version;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(createRelease(process.env));
