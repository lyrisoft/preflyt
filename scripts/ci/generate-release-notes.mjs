// Read-only local preview. Publishing still requires an explicit main workflow dispatch.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { collectChangeNotes } from './release-changes.mjs';

export function previewReleaseNotes(args, run = (command, argv) => execFileSync(command, argv, {encoding:'utf8', maxBuffer:32 * 1024 * 1024})) {
  const options = {};
  for (const arg of args) {
    const match = /^--(base|version|output)=(.+)$/.exec(arg);
    if (match && !Object.hasOwn(options, match[1])) options[match[1]] = match[2];
    else if (arg === '--worktree' && !options.worktree) options.worktree = true;
    else throw new Error('Usage: node scripts/ci/generate-release-notes.mjs --base=vX.Y.Z --version=vX.Y.Z [--worktree] [--output=/tmp/notes.md]');
  }
  if (!options.base || !options.version) throw new Error('Choose --base (previous release tag or commit, or "initial") and --version=vX.Y.Z');
  const sha = run('git', ['rev-parse', 'HEAD']).trim();
  const root = run('git', ['rev-parse', '--show-toplevel']).trim();
  const baseSha = options.base === 'initial' ? null : run('git', ['rev-parse', '--verify', '--end-of-options', `${options.base}^{commit}`]).trim();
  const result = collectChangeNotes({version:options.version, sha, baseSha, worktree:!!options.worktree,root},run);
  return { ...result, output: options.output };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = previewReleaseNotes(process.argv.slice(2));
  if (result.output) writeFileSync(result.output, `${result.notes}\n`, {flag:'wx',mode:0o600});
  else process.stdout.write(`${result.notes}\n`);
}
