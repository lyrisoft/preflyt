// Image-owned scan wrapper. Counts come from the tool output, never from findings alone.
import {spawnSync} from 'node:child_process'
import {opendir,lstat,open,writeFile} from 'node:fs/promises'
import {constants} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {normalizeSemgrepLocations} from './semgrep-locations.mjs'
const configs={'security.sast':'semgrep','quality.reliability':'reliability','quality.maintainability':'maintainability','security.hotspots':'hotspots'}
const config=configs[process.argv[2]]
const eligible=path=>/\.(?:js|jsx|ts|tsx|mjs|cjs|py)$/i.test(path)&&!/(?:^|\/)(?:node_modules|vendor|dist|build|coverage|\.git)\//.test(path)
const pathOf=value=>{
 if(typeof value!=='string') throw new Error('Invalid path')
 const path=value.startsWith('/workspace/')?value.slice(11):value
 if(!path||path.startsWith('/')||/[\\?#%\x00-\x1f]/.test(path)||path.split('/').some(v=>['..','.',''].includes(v))) throw new Error('Invalid path')
 return path
}
const read=async(path,max)=>{
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
 try {const stat=await handle.stat();if(!stat.isFile()||stat.size<1||stat.size>max) throw new Error('Invalid report');const b=Buffer.alloc(stat.size+1);const {bytesRead}=await handle.read(b,0,b.length,0);if(bytesRead!==stat.size)throw new Error('Changing report');return JSON.parse(b.subarray(0,bytesRead).toString('utf8'))}finally{await handle.close()}
}
let exit=2
try {
 if(!Object.hasOwn(configs,process.argv[2])||process.argv.length!==3)throw new Error('Fixed rule required')
 const result=spawnSync('/usr/local/bin/semgrep',['scan','--config',`/opt/preflyt/config/${config}.yaml`,'--metrics','off','--disable-version-check','--no-git-ignore','--max-target-bytes','1048576','--strict','--sarif','--output','/reports/report.sarif','--json-output','/reports/semgrep-stats.json','--error','/workspace'],{cwd:'/workspace',env:process.env,stdio:'ignore',timeout:270000})
 if(result.error||!Number.isInteger(result.status))throw new Error('Scan failed')
 exit=[0,1].includes(result.status)?result.status:2
 const report=normalizeSemgrepLocations(await read('/reports/report.sarif',262144))
 try {
  const stats=await read('/reports/semgrep-stats.json',2097152)
  if(!Array.isArray(stats.errors)||stats.errors.length||!Array.isArray(stats.paths?.scanned)||stats.paths.scanned.length>8000) {exit=2;throw new Error('Scan metadata unavailable')}
  const candidates=new Set()
  let count=0
  const walk=async(relative='')=>{
   if(relative.split('/').length>32)throw new Error('Unbounded source')
   for await(const entry of await opendir(join('/workspace',relative))){
    const path=pathOf(relative?relative+'/'+entry.name:entry.name),info=await lstat(join('/workspace',path))
    if(info.isSymbolicLink()||++count>20000)throw new Error('Invalid source')
    if(info.isDirectory())await walk(path)
    else if(info.isFile()&&info.size<=1048576&&eligible(path))candidates.add(path)
   }
  }
  await walk()
  if(candidates.size>8000)throw new Error('Unbounded candidate scope')
  const scanned=new Set(stats.paths.scanned.map(pathOf))
  if([...scanned].some(path=>!candidates.has(path)))throw new Error('Unexpected analyzed file')
  if(report.version!=='2.1.0'||report.runs?.length!==1)throw new Error('Invalid SARIF')
  report.runs[0].properties={...report.runs[0].properties,preflytFileAnalysis:{version:1,formula:'semgrep-candidate-files-v1',scope:'js-ts-python',candidateFiles:candidates.size,analyzedFiles:scanned.size,skippedFiles:candidates.size-scanned.size,pathsDigest:createHash('sha256').update(JSON.stringify({candidate:[...candidates].sort(),analyzed:[...scanned].sort()})).digest('hex')}}
  const text=JSON.stringify(report);if(Buffer.byteLength(text)>262144)throw new Error('Oversized report')
  await writeFile('/reports/report.sarif',text)
 }catch {
  if(exit===2 && report.runs?.length===1) {
   report.runs[0].properties={...report.runs[0].properties,preflytFileAnalysisUnavailable:'SCAN_ERRORS'}
   const text=JSON.stringify(report);if(Buffer.byteLength(text)<=262144)await writeFile('/reports/report.sarif',text)
  }
  // Keep original findings, but never publish an invented file count.
 }
}catch {exit=2}
process.exitCode=exit
