// Dedicated scanner service. Never load the API's dotenv file or its platform credentials.
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile, lstat } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dockerCommand } from './execution/native-docker-job.js'
import { nativeAdapters, type NativeRuleId, type NativeToolReview } from './execution/native-plan.js'
import { digest } from './assessments/assessment-digest.js'
import { healthConnectionFile } from './health/health-scanner-client.js'
import { healthDockerControls, type HealthScannerPackage } from './health/health-scanner-package.js'
import { healthScannerServer } from './health/health-scanner-server.js'
import { execFileSync } from 'node:child_process'

const forbidden=['DATABASE_URL','QUEUE_REDIS_URL','GITHUB_APP_PRIVATE_KEY','GITHUB_APP_CLIENT_SECRET','OIDC_CLIENT_SECRET','OPENAI_API_KEY','ANTHROPIC_API_KEY','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','CONFIGURATION_ENCRYPTION_KEY','AI_PROVIDER_ENCRYPTION_KEY','SMTP_PASSWORD']
if(forbidden.some(key=>process.env[key]))throw new Error('Run the scanner service in its dedicated credential-free environment')
const directory=resolve(process.env.HEALTH_SCANNER_STATE_DIRECTORY??join(dirname(healthConnectionFile()),'../health-scanner-host'))
await mkdir(directory,{recursive:true,mode:0o700})
const stat=await lstat(directory)
if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||(process.getuid&&stat.uid!==process.getuid()))throw new Error('Use an owned private scanner directory')
const identityFile=join(directory,'identity.json')
let identity:{apiKey:string;publicKey:string;privateKey:string;createdAt:string}
try {identity=JSON.parse(await readFile(identityFile,'utf8'))}
catch(error){if((error as any).code!=='ENOENT')throw error;const key=generateKeyPairSync('ed25519');identity={apiKey:randomBytes(32).toString('hex'),publicKey:key.publicKey.export({type:'spki',format:'pem'}).toString(),privateKey:key.privateKey.export({type:'pkcs8',format:'pem'}).toString(),createdAt:new Date().toISOString()};await writeFile(identityFile,JSON.stringify(identity),{mode:0o600,flag:'wx'})}
const toolDirectory=process.env.HEALTH_SCANNER_TOOLS_DIRECTORY??resolve(dirname(fileURLToPath(import.meta.url)),'../../../docs/deployment/native-runner')
const configHash=digest(await Promise.all(['adapters.json','runner.mjs','source-verification.mjs','semgrep-measure.mjs','semgrep-locations.mjs','config/semgrep.yaml','config/reliability.yaml','config/maintainability.yaml','config/hotspots.yaml','config/gitleaks.toml','config/trivy.yaml','duplication/scan.mjs','duplication/compact-store.mjs'].map(async path=>({path,content:await readFile(join(toolDirectory,path),'utf8')}))))
const definitions=[
 {name:'gitleaks',file:'Dockerfile.gitleaks',rules:['secrets.scan'],versionCommand:['/usr/local/bin/gitleaks','version']},
 {name:'semgrep',file:'Dockerfile.semgrep',rules:['security.sast','quality.reliability','quality.maintainability','security.hotspots'],versionCommand:['/usr/local/bin/semgrep','--version']},
 {name:'duplication',file:'Dockerfile.duplication',rules:['quality.duplication'],versionCommand:['/usr/local/bin/node','-e',"console.log(JSON.parse(require('fs').readFileSync('/opt/preflyt/duplication/node_modules/jscpd/package.json')).version)"]},
 {name:'trivy',file:'Dockerfile.trivy',target:'runtime',rules:['iac.policy'],versionCommand:['/usr/local/bin/trivy','--version']},
 {name:'dependencies',file:'Dockerfile.trivy',target:'dependencies',rules:['security.dependencies'],versionCommand:['/usr/local/bin/trivy','--version']},
]
const reviews:NativeToolReview[]=[]
async function prepareScanner(definition:typeof definitions[number], refresh=false){
 const prepared:NativeToolReview[]=[]
 const tag='preflyt-health-'+definition.name+':'+configHash.slice(0,16)+(definition.name==='dependencies'?'-'+new Date().toISOString().slice(0,10).replaceAll('-',''):'')
 console.info('Preparing Preflyt scanner: '+definition.name)
 await dockerCommand(['build','--quiet',...(refresh?['--no-cache']:[]),'-f',join(toolDirectory,definition.file),'-t',tag,...(definition.target?['--target',definition.target]:[]),toolDirectory],{timeoutMs:1200000,maxBytes:512000})
 const image=(await dockerCommand(['image','inspect',tag,'--format','{{.Id}}'])).toString().trim()
 if(!/^sha256:[a-f0-9]{64}$/.test(image))throw new Error('Scanner image could not be pinned')
 const [executable,...args]=definition.versionCommand
 const version=(await dockerCommand(['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges=true','--user','65532:65532','--tmpfs','/scratch:rw,nosuid,nodev,noexec,size=134217728,mode=1777','--env','HOME=/scratch','--env','TMPDIR=/scratch','--env','SEMGREP_ENABLE_VERSION_CHECK=0','--env','SEMGREP_SEND_METRICS=off','--entrypoint',executable,image,...args],{timeoutMs:60000})).toString().match(/\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.]+)?/)?.[0]
 if(!version)throw new Error('Scanner version could not be established')
 let databaseBuiltAt:string|null=null
 if(definition.name==='dependencies'){
  const value=JSON.parse((await dockerCommand(['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges=true','--user','65532:65532','--entrypoint','/usr/local/bin/node',image,'-e',"process.stdout.write(require('fs').readFileSync('/opt/preflyt/trivy-cache/db/metadata.json'))"])).toString())
  databaseBuiltAt=value.UpdatedAt
 }
 for(const ruleId of definition.rules as NativeRuleId[])prepared.push({ruleId,image,toolVersion:version,license:nativeAdapters[ruleId].license,configHash,reviewDigest:digest({image,configHash,ruleId}),expiresAt:'2099-01-01T00:00:00Z',databaseBuiltAt})
 return prepared
}
for(const definition of definitions)reviews.push(...await prepareScanner(definition))
const info=JSON.parse((await dockerCommand(['info','--format','{{json .}}'])).toString())
const runtime=info.Runtimes?.runsc?'runsc':info.Runtimes?.kata?'kata':'runc'
const pkg:HealthScannerPackage={version:1,environmentId:'preflyt-health-'+digest(info.ID).slice(0,16),runtime,controlsHash:healthDockerControls(info,runtime),controllerPublicKey:identity.publicKey,createdAt:identity.createdAt,tools:reviews}
// Only the service gets the signing key. API/worker receive a public key and scoped HTTP credential.
process.env.NATIVE_CONTROLLER_SIGNING_KEY=identity.privateKey
const certFile=join(directory,'scanner-cert.pem'),keyFile=join(directory,'scanner-key.pem')
try {await readFile(certFile)} catch(error){if((error as any).code!=='ENOENT')throw error;execFileSync('openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-keyout',keyFile,'-out',certFile,'-days','3650','-subj','/CN=preflyt-health-scanner','-addext','subjectAltName=DNS:health-scanner,DNS:localhost,IP:127.0.0.1,IP:::1'],{stdio:'ignore'});await chmod(keyFile,0o600)}
const certificate=await readFile(certFile,'utf8')
const {server,idle,maintain,close}=await healthScannerServer(pkg,identity.apiKey,process.env.HEALTH_SCANNER_JOBS_DIRECTORY??join(directory,'jobs'),dockerCommand,{key:await readFile(keyFile,'utf8'),cert:certificate})
const port=Number(process.env.HEALTH_SCANNER_PORT??'3011')
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid scanner port')
await new Promise<void>((ready,reject)=>{server.once('error',reject);server.listen(port,process.env.HEALTH_SCANNER_HOST??'127.0.0.1',ready)})
const connectionFile=healthConnectionFile();await mkdir(dirname(connectionFile),{recursive:true,mode:0o700})
await writeFile(connectionFile,JSON.stringify({origin:process.env.HEALTH_SCANNER_ORIGIN??'https://127.0.0.1:'+port,apiKey:identity.apiKey,publicKey:identity.publicKey,ca:certificate}),{mode:0o600});await chmod(connectionFile,0o600)
console.info('Preflyt Health scanner is ready. Repository scans require no additional approval.')
let refreshing=false,pendingDatabase:NativeToolReview[]|undefined,nextRefresh=0
const maintenance=setInterval(async()=>{
 if(!idle()||refreshing)return
 try{await maintain()}catch{console.warn('Health journal retention could not be completed')}
 if(!idle())return
 if(pendingDatabase){pkg.tools=pkg.tools.filter(tool=>tool.ruleId!=='security.dependencies').concat(pendingDatabase);pendingDatabase=undefined}
 const dependency=pkg.tools.find(tool=>tool.ruleId==='security.dependencies')
 if(Date.now()<nextRefresh||!dependency?.databaseBuiltAt||Date.now()-Date.parse(dependency.databaseBuiltAt)<20*3600000)return
 nextRefresh=Date.now()+3600000
 refreshing=true
 try{pendingDatabase=await prepareScanner(definitions.find(definition=>definition.name==='dependencies')!,true)}
 catch{console.warn('Dependency database refresh unavailable; stale data will not be accepted as passing evidence')}
 finally{refreshing=false}
},60000)
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{clearInterval(maintenance);await close();process.exit(0)})
