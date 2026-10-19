import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {releaseVersion} from './release-version.mjs';
import {prepareReleaseNotes} from './release-changes.mjs';
export function planRelease(env, run = (command, args) => execFileSync(command, args, {encoding:'utf8', maxBuffer:32 * 1024 * 1024}), loadNotes = prepareReleaseNotes, write = appendFileSync) {
  if(env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='workflow_dispatch')throw new Error('Version planning requires manual main publication');
  const repository=env.GITHUB_REPOSITORY,sha=env.GITHUB_SHA;
  if(!/^[a-zA-Z0-9-]+\/preflyt$/.test(repository??'')||!/^[a-f0-9]{40}$/.test(sha??''))throw new Error('Invalid release identity');
  const raw=run('gh',['api',`repos/${repository}/tags`,'--paginate','--jq','.[] | {name, sha: .commit.sha}']);
  const tags=raw.trim().split('\n').filter(Boolean).map(JSON.parse);
  const {version}=releaseVersion(tags,sha);
  // Fail before any image build spends runner time or publishes artifacts.
  const plan = loadNotes({version, sha, repository, tags}, run);
  write(env.GITHUB_OUTPUT,`version=${version}\nnotes_sha256=${plan.digest}\n`);
  if (env.GITHUB_STEP_SUMMARY) write(env.GITHUB_STEP_SUMMARY, `## ${version}: ${plan.existing ? 'existing published notes preserved' : 'prepared release notes'}\n\n${plan.notes}\n`);
  return version;
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) planRelease(process.env);
