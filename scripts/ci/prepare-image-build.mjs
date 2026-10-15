// Ephemeral hosted CI only. Never prune Docker images, volumes, or local projects.
import {execFileSync} from 'node:child_process'
import {statfsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
export const unusedToolchains=['/usr/local/lib/android','/usr/share/dotnet','/opt/ghc','/usr/local/.ghcup']
export const minimumImageBuildBytes=24*1024**3
export function prepareImageBuild(env,run=(args)=>execFileSync('sudo',args,{stdio:'inherit'}),free=()=>{const value=statfsSync('/');return value.bavail*value.bsize},log=console.info) {
 if(env.GITHUB_ACTIONS!=='true'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.RUNNER_OS!=='Linux'||env.RUNNER_ARCH!=='X64')throw new Error('Image disk preparation is restricted to ephemeral GitHub-hosted Linux AMD64 runners')
 const before=free()
 run(['rm','-rf','--',...unusedToolchains])
 const after=free()
 log(`Image build disk: ${(before/1024**3).toFixed(1)} GiB before, ${(after/1024**3).toFixed(1)} GiB after removing unused hosted toolchains`)
 if(after<minimumImageBuildBytes)throw new Error('At least 24 GiB free disk is required before the API image build; stopping before expensive work')
 return after
}
if(process.argv[1]===fileURLToPath(import.meta.url))prepareImageBuild(process.env)
