// Complete local image qualification. Never pushes images or starts GitHub Actions.
import {execFileSync} from 'node:child_process'
import {mkdtempSync,openSync,closeSync,writeFileSync,readFileSync,statfsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {images} from './publish-release.mjs'
export const nativeImages={
 'preflyt-native-node':['Dockerfile.node',''],
 'preflyt-native-gitleaks':['Dockerfile.gitleaks',''],
 'preflyt-native-semgrep':['Dockerfile.semgrep',''],
 'preflyt-native-duplication':['Dockerfile.duplication',''],
 'preflyt-native-trivy':['Dockerfile.trivy','runtime'],
 'preflyt-native-trivy-offline':['Dockerfile.trivy','dependencies'],
}
export const minimumLocalImageBytes=12*1024**3
export function checkLocalImageSpace(hostBytes,dockerBytes) {
 for(const [name,bytes] of [['Host',hostBytes],['Docker',dockerBytes]])if(!Number.isFinite(bytes)||bytes<minimumLocalImageBytes)throw new Error(name+' filesystem has less than 12 GiB free; stopping before another image build')
}
export function localImageTargets(architecture,group,version='verify') {
 if(!['amd64','arm64'].includes(architecture)||!['api','web','native'].includes(group)||!/^[-a-z0-9]+$/.test(version))throw new Error('Invalid local image selection')
 const catalog=group==='native'?nativeImages:Object.fromEntries(Object.entries(images).filter(([name])=>(name==='preflyt-web')===(group==='web')))
 return Object.fromEntries(Object.entries(catalog).map(([name,[file,target]])=>[name,{
  context:group==='native'?'docs/deployment/native-runner':'.',
  dockerfile:file,...(target?{target}:{}),platforms:['linux/'+architecture],
  tags:[`preflyt-local/${name}:${version}-${architecture}`],
  ...(['preflyt-health-scanner','preflyt-native-trivy-offline'].includes(name)?{args:{PREFLYT_DATABASE_EPOCH:new Date().toISOString().slice(0,10)}}:{}),
  output:['type=docker'],
 }]))
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const architectures=process.argv[2]?[process.argv[2]]:['amd64','arm64'],groups=process.argv[3]?[process.argv[3]]:['api','web','native']
 for(const architecture of architectures)for(const group of groups)localImageTargets(architecture,group)
 const base=readFileSync('deploy/api.Dockerfile','utf8').match(/^FROM (node:[^\s]+@sha256:[a-f0-9]{64}) AS base$/m)?.[1]
 if(!base)throw new Error('A pinned Node base is required for the Docker filesystem preflight')
 const directory=mkdtempSync(join(tmpdir(),'preflyt-all-images-')),version='check-'+Date.now(),results=[]
 console.info('Build evidence: '+directory)
 for(const architecture of architectures)for(const group of groups){
  const disk=statfsSync('.'),free=disk.bavail*disk.bsize
  // Docker Desktop has a separate disk limit. Host free space cannot establish it.
  checkLocalImageSpace(free,minimumLocalImageBytes)
  const dockerFree=Number(execFileSync('docker',['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','65532:65532','--pids-limit','32','--memory','64m','--entrypoint','node',base,'-e',"const s=require('node:fs').statfsSync('/');process.stdout.write(String(s.bavail*s.bsize))"],{encoding:'utf8',stdio:['ignore','pipe','inherit']}))
  checkLocalImageSpace(free,dockerFree)
  const target=localImageTargets(architecture,group,version),file=join(directory,`${group}-${architecture}.json`),log=join(directory,`${group}-${architecture}.log`)
  writeFileSync(file,JSON.stringify({group:{default:{targets:Object.keys(target)}},target}))
  const fd=openSync(log,'w');console.info(`Building ${group} (${architecture}); host ${(free/1024**3).toFixed(1)} GiB, Docker ${(dockerFree/1024**3).toFixed(1)} GiB free; log: ${log}`)
  try{execFileSync('docker',['buildx','bake','-f',file,'--load','--progress=plain'],{stdio:['ignore',fd,fd]})}
  catch(error){throw new Error(`Local ${group} (${architecture}) build failed; inspect ${log}`,{cause:error})}
  finally{closeSync(fd)}
  for(const [name,definition] of Object.entries(target)){
   const tag=definition.tags[0],inspect=JSON.parse(execFileSync('docker',['image','inspect',tag,'--format','{"id":{{json .Id}},"architecture":{{json .Architecture}}}'],{encoding:'utf8'}))
   if(inspect.architecture!==architecture||!/^sha256:[a-f0-9]{64}$/.test(inspect.id))throw new Error('Loaded image architecture or content ID differs: '+tag)
   results.push({name,tag,...inspect})
  }
  writeFileSync(join(directory,'results.json'),JSON.stringify(results,null,2))
  console.info(`Verified ${Object.keys(target).length} ${group} images (${architecture})`)
 }
 console.info(`All ${results.length} local images built and inspected. Evidence: ${directory}/results.json`)
}
