import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { images } from './publish-release.mjs';
import { renderReleaseNotes } from './release-notes.mjs';
import { prepareReleaseNotes } from './release-changes.mjs';
import { releaseVersion } from './release-version.mjs';
export { releaseVersion } from './release-version.mjs';
const missing = error => /HTTP 404|manifest unknown|not found/i.test(String(error.stderr ?? ''));
export function createRelease(env, run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 }), loadNotes = prepareReleaseNotes) {
  const { GITHUB_SHA: sha, GITHUB_REPOSITORY: repository, GITHUB_REPOSITORY_OWNER: owner, GITHUB_REF: ref, GITHUB_EVENT_NAME: event } = env;
  if (ref !== 'refs/heads/main' || event !== 'workflow_dispatch') throw new Error('Releases require a manual dispatch on main');
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || !/^[a-zA-Z0-9-]+$/.test(owner ?? '') || repository !== `${owner}/preflyt`) throw new Error('Invalid release identity');
  const api = (endpoint, ...args) => run('gh', ['api', `repos/${repository}/${endpoint}`, ...args]);
  const tags = api('tags', '--paginate', '--jq', '.[] | {name, sha: .commit.sha}').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const { version, reserved } = releaseVersion(tags, sha);
  if (env.PREFLYT_BUILD_VERSION && env.PREFLYT_BUILD_VERSION !== version) throw new Error('Planned build version changed; rebuild before publication');
  const plan = loadNotes({ version, sha, repository, tags }, run);
  if (!plan.existing && (!/^[a-f0-9]{64}$/.test(env.PREFLYT_RELEASE_NOTES_SHA256 ?? '') || env.PREFLYT_RELEASE_NOTES_SHA256 !== plan.digest)) throw new Error('Planned release notes changed or the pre-build hash is missing; review and rerun publication');
  const notes = plan.existing ? null : renderReleaseNotes({ notes: plan.notes, version, sha, repository, previousVersion: plan.previousVersion });
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
  if (!release && plan.existing) throw new Error('Published release disappeared; refusing to recreate it from an old description');
  if (!release) run('gh', ['release', 'create', version, '--repo', repository, '--verify-tag', '--title', `Preflyt ${version}`, '--notes', notes]);
  return version;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(createRelease(process.env));
