import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateReleaseNotes } from './release-notes.mjs';
import { compareVersions, stableVersion } from './release-version.mjs';

const commit = /^[a-f0-9]{40}$/;
const changePath = /^\.changes\/[a-z0-9][a-z0-9-]{0,99}\.json$/;
const ignored = new Set(['.changes/README.md', '.changes/TEMPLATE.json']);
const types = ['feature', 'improvement', 'fix', 'documentation'];
const runCommand = (command, args) => execFileSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const plain = (value, field, file, max) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${file}: ${field} must contain 1–${max} characters`);
  if (/[\r\n<>\u0000-\u001f]|preflyt-release-ready:|\b(?:TODO|TBD|REPLACE_ME)\b/.test(value)) {
    throw new Error(`${file}: ${field} must be one finished paragraph without HTML, control characters or placeholders`);
  }
  return value.trim();
};

export function parseChangeFile(text, file) {
  if (!changePath.test(file)) throw new Error(`${file}: use .changes/a-short-description.json`);
  if (Buffer.byteLength(text) > 16 * 1024) throw new Error(`${file}: change files must not exceed 16 KiB`);
  let value;
  try { value = JSON.parse(text); } catch { throw new Error(`${file}: invalid JSON`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${file}: expected a JSON object`);
  const fields = new Set(['type', 'title', 'description', 'upgrade', 'migrations', 'configuration']);
  for (const key of Object.keys(value)) if (!fields.has(key)) throw new Error(`${file}: unknown field ${key}`);
  if (!types.includes(value.type)) throw new Error(`${file}: type must be ${types.join(', ')}`);
  const result = {
    file, type: value.type,
    title: plain(value.title, 'title', file, 120),
    description: plain(value.description, 'description', file, 1500),
    upgrade: plain(value.upgrade, 'upgrade', file, 2000),
  };
  if (/[\[\]*_`#]/.test(result.title)) throw new Error(`${file}: title must be plain text`);
  for (const field of ['migrations', 'configuration']) {
    const paths = value[field] ?? [];
    if (!Array.isArray(paths) || paths.length > 1000 || paths.some(path => typeof path !== 'string' || !path || path.length > 300 || path.startsWith('/') || path.split('/').includes('..') || /[\x00-\x20\\]/.test(path))) {
      throw new Error(`${file}: ${field} must be an array of repository-relative file paths`);
    }
    if (new Set(paths).size !== paths.length) throw new Error(`${file}: ${field} contains duplicate paths`);
    result[field] = paths;
  }
  if ((result.migrations.length || result.configuration.length) && result.upgrade.toLowerCase() === 'none') {
    throw new Error(`${file}: explain the required upgrade action for the listed migration or configuration changes`);
  }
  return result;
}

export function upgradeCategory(path) {
  if (/^apps\/api\/prisma\/migrations\/[^/]+\/migration\.sql$/.test(path)) return 'migrations';
  if (/(^|\/)\.env(?:\.[^/]+)?\.example$/.test(path) ||
      /^(?:docker-compose|compose(?:\.[a-z0-9-]+)*)\.ya?ml$/.test(path) ||
      /^deploy\/.*\.(?:ya?ml|json|conf)$/.test(path) ||
      path === 'apps/api/src/configuration/configuration-catalogue.ts') return 'configuration';
  return null;
}

export function assembleChangeNotes(changes, paths, version) {
  if (!changes.length) throw new Error('No new change files since the previous published release. Add .changes/a-short-description.json.');
  const required = { migrations: new Set(), configuration: new Set() };
  for (const path of paths) {
    const category = upgradeCategory(path);
    if (category) required[category].add(path);
  }
  for (const field of ['migrations', 'configuration']) {
    const covered = new Set();
    for (const change of changes) {
      for (const path of change[field]) {
        if (!required[field].has(path)) throw new Error(`${change.file}: ${field} references a file not changed in this release: ${path}`);
        covered.add(path);
      }
    }
    const missing = [...required[field]].filter(path => !covered.has(path));
    if (missing.length) throw new Error(`Missing upgrade explanation for ${field}: ${missing.join(', ')}. List these files in a change file and explain the required action.`);
  }
  const sorted = [...changes].sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const bullet = change => `- **${change.title}:** ${change.description}`;
  const features = sorted.filter(change => change.type === 'feature').map(bullet);
  const fixes = sorted.filter(change => change.type !== 'feature').map(bullet);
  const upgrades = [...new Set(sorted.map(change => change.upgrade).filter(text => text.toLowerCase() !== 'none'))];
  return validateReleaseNotes([
    "## What's new", features.join('\n') || 'No new features in this release.',
    '## Improvements and fixes', fixes.join('\n') || 'No additional improvements or fixes in this release.',
    '## Upgrade notes', upgrades.map(text => `- ${text}`).join('\n') || 'No additional upgrade steps are required.',
    'Follow the [Compose upgrade guide](https://docs.preflytlabs.com/self-hosting/upgrades-and-backups) when updating your installation.',
  ].join('\n\n'), version);
}

function diffEntries(raw) {
  const fields = raw.split('\0');
  if (fields.at(-1) === '') fields.pop();
  if (fields.length % 2) throw new Error('Malformed Git change list');
  const entries = [];
  for (let index = 0; index < fields.length; index += 2) {
    if (!/^[AMD]$/.test(fields[index])) throw new Error(`Unsupported Git change status: ${fields[index]}`);
    entries.push({ status: fields[index], path: fields[index + 1] });
  }
  return entries;
}

export function collectChangeNotes({ version, sha, baseSha = null, worktree = false, root = process.cwd() }, run = runCommand) {
  if (!stableVersion.test(version) || !commit.test(sha) || (baseSha !== null && !commit.test(baseSha))) throw new Error('Invalid release change range');
  if (run('git', ['rev-parse', 'HEAD']).trim() !== sha) throw new Error('Release checkout differs from the requested commit');
  if (baseSha) {
    try { run('git', ['merge-base', '--is-ancestor', baseSha, sha]); }
    catch { throw new Error('Cannot compare the previous release with this commit. Fetch full Git history and use a branch descended from the published release.'); }
  }
  let entries;
  if (baseSha) {
    entries = diffEntries(run('git', ['diff', '--name-status', '--no-renames', '-z', baseSha, ...(worktree ? [] : [sha]), '--']));
  } else {
    entries = run('git', ['ls-tree', '-r', '--name-only', '-z', sha]).split('\0').filter(Boolean).map(path => ({ status: 'A', path }));
    if (worktree) {
      const working = diffEntries(run('git', ['diff', '--name-status', '--no-renames', '-z', sha, '--']));
      const byPath = new Map(entries.map(entry => [entry.path, entry]));
      for (const entry of working) {
        if (entry.status === 'D') byPath.delete(entry.path);
        else byPath.set(entry.path, { status: 'A', path: entry.path });
      }
      entries = [...byPath.values()];
    }
  }
  if (worktree) {
    const known = new Set(entries.map(entry => entry.path));
    for (const path of run('git', ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)) {
      if (!known.has(path)) entries.push({ status: 'A', path });
    }
  }
  const files = entries.filter(entry => entry.path.startsWith('.changes/') && !ignored.has(entry.path));
  const changes = files.map(({ path, status }) => {
    if (status !== 'A') throw new Error(`${path}: previously released change files are immutable. Add a new file for corrections.`);
    let text;
    if (worktree) {
      const file = resolve(root, path);
      if (!changePath.test(path) || !lstatSync(file).isFile()) throw new Error(`${path}: expected a regular JSON change file`);
      text = readFileSync(file, 'utf8');
    } else text = run('git', ['show', `${sha}:${path}`]);
    return parseChangeFile(text, path);
  });
  return { notes: assembleChangeNotes(changes, entries.map(entry => entry.path), version), files: changes.map(change => change.file).sort() };
}

export function notesDigest(plan) {
  return createHash('sha256').update(JSON.stringify({ version: plan.version, sha: plan.sha, baseSha: plan.baseSha, previousVersion: plan.previousVersion, files: plan.files, notes: plan.notes })).digest('hex');
}

export function prepareReleaseNotes({ version, sha, repository, tags }, run = runCommand) {
  if (!stableVersion.test(version) || !commit.test(sha) || !/^[a-zA-Z0-9-]+\/preflyt$/.test(repository)) throw new Error('Invalid release identity');
  const raw = run('gh', ['api', `repos/${repository}/releases`, '--paginate', '--jq', '.[] | {tag_name, draft, prerelease, body}']);
  const releases = raw.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const existing = releases.find(release => release.tag_name === version);
  if (existing) {
    if (existing.draft || existing.prerelease) throw new Error('Existing release is not a published stable release');
    if (tags.find(tag => tag.name === version)?.sha !== sha) throw new Error('Existing release tag differs from the requested commit');
    const markers = [...(existing.body ?? '').matchAll(/<!-- preflyt-release-ready:v1 sha=([a-f0-9]{40}) -->/g)];
    if (markers.length > 1 || (markers.length && markers[0][1] !== sha)) throw new Error('Existing release marker differs from the requested commit');
    const plan = { version, sha, baseSha: sha, previousVersion: version, files: [], notes: existing.body ?? '', existing: true };
    return { ...plan, digest: notesDigest(plan) };
  }
  const previous = releases.filter(release => !release.draft && !release.prerelease && stableVersion.test(release.tag_name) && compareVersions(release.tag_name, version) < 0 && /<!-- preflyt-release-ready:v1 sha=[a-f0-9]{40} -->/.test(release.body ?? ''))
    .sort((a, b) => compareVersions(b.tag_name, a.tag_name))[0];
  let baseSha = null;
  if (previous) {
    const markers = [...previous.body.matchAll(/<!-- preflyt-release-ready:v1 sha=([a-f0-9]{40}) -->/g)];
    baseSha = markers[0][1];
    if (markers.length !== 1 || tags.find(tag => tag.name === previous.tag_name)?.sha !== baseSha) throw new Error('Previous release tag and image-readiness marker differ');
  } else if (tags.some(tag => stableVersion.test(tag.name) && compareVersions(tag.name, version) < 0)) {
    throw new Error('No published image-ready baseline found. Restore release metadata before generating notes.');
  }
  const plan = { version, sha, baseSha, previousVersion: previous?.tag_name, ...collectChangeNotes({ version, sha, baseSha }, run) };
  return { ...plan, digest: notesDigest(plan) };
}
