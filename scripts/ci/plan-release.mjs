import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {releaseVersion} from './create-release.mjs';
if(process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch')throw new Error('Version planning requires manual main publication');
const repository=process.env.GITHUB_REPOSITORY,sha=process.env.GITHUB_SHA;
if(!/^[a-zA-Z0-9-]+\/preflyt$/.test(repository??'')||!/^[a-f0-9]{40}$/.test(sha??''))throw new Error('Invalid release identity');
const raw=execFileSync('gh',['api',`repos/${repository}/tags`,'--paginate','--jq','.[] | {name, sha: .commit.sha}'],{encoding:'utf8'});
const {version}=releaseVersion(raw.trim().split('\n').filter(Boolean).map(JSON.parse),sha);
appendFileSync(process.env.GITHUB_OUTPUT,`version=${version}\n`);
