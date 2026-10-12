// Unsigned, read-only review inputs. Never enables execution or creates approval evidence.
import 'dotenv/config'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {nativeRuntimeApproval} from '../src/execution/native-runtime.js'
import {nativeAdapters,nativeToolReviews} from '../src/execution/native-plan.js'
import {healthAnalyses} from '../src/health/health-report.js'
import {isolationTests} from '../src/execution/native-approval.js'
const project=resolve(new URL('../../../',import.meta.url).pathname)
const hash=async(path:string)=>createHash('sha256').update(await readFile(resolve(project,path))).digest('hex')
const images:Record<string,string>={'secrets.scan':'preflyt-native-gitleaks:fixture','security.sast':'preflyt-p5-semgrep-fixture:latest','security.dependencies':'preflyt-native-trivy-offline:fixture','iac.policy':'preflyt-native-trivy:fixture','quality.reliability':'preflyt-p5-semgrep-fixture:latest','quality.maintainability':'preflyt-p5-semgrep-fixture:latest','quality.duplication':'preflyt-p5-duplication-fixture:latest','security.hotspots':'preflyt-p5-semgrep-fixture:latest','tests.coverage':'preflyt-p5-node-fixture:latest'}
const configurations:Record<string,string[]>={'secrets.scan':['config/gitleaks.toml','config/.gitleaksignore'],'security.sast':['config/semgrep.yaml','semgrep-measure.mjs'],'security.dependencies':['config/trivy.yaml','config/.trivyignore'],'iac.policy':['config/trivy.yaml','config/.trivyignore'],'quality.reliability':['config/reliability.yaml','semgrep-measure.mjs'],'quality.maintainability':['config/maintainability.yaml','semgrep-measure.mjs'],'quality.duplication':['duplication/scan.mjs','duplication/package.json','duplication/package-lock.json'],'security.hotspots':['config/hotspots.yaml','semgrep-measure.mjs'],'tests.coverage':['coverage/run.mjs']}
const sharedRunnerInputs=await Promise.all(['runner.mjs','source-verification.mjs','source-initializer.mjs','adapters.json'].map(async path=>({path,sha256:await hash('docs/deployment/native-runner/'+path)})))
const inventory=[]
for(const analysis of healthAnalyses){
 let image:null|{localId:string;os:string;architecture:string;registryDigests:string[]}=null
 try{const [v]=JSON.parse(execFileSync('docker',['image','inspect',images[analysis.id]],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:15000}));image={localId:v.Id,os:v.Os,architecture:v.Architecture,registryDigests:v.RepoDigests??[]}}catch{}
 inventory.push({ruleId:analysis.id,category:analysis.category,adapter:nativeAdapters[analysis.id],localFixtureImage:images[analysis.id],image,sourceInputs:await Promise.all(configurations[analysis.id].map(async path=>({path,sha256:await hash('docs/deployment/native-runner/'+path)}))),qualification:'PENDING_INDEPENDENT_REVIEW'})
}
let localDockerRuntimes:string[]=[]
try{localDockerRuntimes=Object.keys(JSON.parse(execFileSync('docker',['info','--format','{{json .Runtimes}}'],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:15000})))}catch{}
const document={version:1,createdAt:new Date().toISOString(),purpose:'Qualification inputs only; not approval or production isolation evidence',branch:execFileSync('git',['branch','--show-current'],{cwd:project,encoding:'utf8'}).trim(),commit:execFileSync('git',['rev-parse','HEAD'],{cwd:project,encoding:'utf8'}).trim(),sourceIncludesUncommittedChanges:!!execFileSync('git',['status','--porcelain'],{cwd:project,encoding:'utf8'}).trim(),runtime:{selectedBackend:process.env.NATIVE_RUNTIME_BACKEND??'kubernetes',independentReviewValid:!!nativeRuntimeApproval(),configuredReviewedRules:nativeToolReviews()?.reviews.map(r=>r.ruleId)??[],dedicatedKubeconfigConfigured:!!process.env.NATIVE_KUBECONFIG,localDockerRuntimes},requiredIndependentNegativeTests:[...isolationTests],sharedRunnerInputs,analyzers:inventory,remainingAcceptance:['Choose and independently qualify a dedicated runtime','Retain actual negative-test artifacts and a trusted reviewer signature','Review applicable analyzer scope and exact published/transferred image artifacts','Demonstrate live connected-repository results and source locations','Accept target-project test recipes and report limits']}
const output=resolve(process.argv[2]??'../../artifacts/p5-qualification-inventory.json')
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(document,null,2)+'\n',{mode:0o600})
console.log(JSON.stringify({output,analyzers:inventory.length,analyzersWithLocalImage:inventory.filter(i=>i.image).length,uniqueLocalImages:new Set(inventory.flatMap(i=>i.image?[i.image.localId]:[])).size,independentReviewValid:document.runtime.independentReviewValid,approved:false}))
