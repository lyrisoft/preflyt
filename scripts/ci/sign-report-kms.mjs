import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run=promisify(execFile)
const fail=()=>{throw new Error('Provide a bounded report, output path, asymmetric KMS key ARN and approved signing key ID from a trusted GitHub-hosted workflow')}
async function main() {
 const [reportPath,outputPath,keyArn,kid]=process.argv.slice(2)
 if(!reportPath||!outputPath||!/^arn:aws[a-z-]*:kms:[a-z0-9-]+:[0-9]{12}:key\/[a-zA-Z0-9-]+$/.test(keyArn??'')||!/^[a-zA-Z0-9_-]{1,100}$/.test(kid??''))fail()
 const env=process.env
 const workflow=(env.GITHUB_WORKFLOW_REF??'').split('@')[0]
 if(env.GITHUB_ACTIONS!=='true'||env.RUNNER_ENVIRONMENT!=='github-hosted'||!/^[1-9][0-9]{0,15}$/.test(env.GITHUB_REPOSITORY_ID??'')||!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(env.GITHUB_REPOSITORY??'')||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||!/^[a-f0-9]{40}$/.test(env.GITHUB_WORKFLOW_SHA??'')||!/^[1-9][0-9]{0,15}$/.test(env.GITHUB_RUN_ID??'')||!/^[1-9][0-9]{0,8}$/.test(env.GITHUB_RUN_ATTEMPT??'')||!workflow.startsWith(env.GITHUB_REPOSITORY+'/.github/workflows/')||!/\.ya?ml$/.test(workflow))fail()
 const report=await readFile(reportPath)
 if(!report.length||report.length>256*1024)fail()
 const format='preflyt.organization-report.v1'
 const payload={schemaVersion:1,subjectSha256:createHash('sha256').update(report).digest('hex'),repositoryId:env.GITHUB_REPOSITORY_ID,repositoryName:env.GITHUB_REPOSITORY,sourceSha:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,runAttempt:Number(env.GITHUB_RUN_ATTEMPT),signerWorkflow:workflow,signerDigest:env.GITHUB_WORKFLOW_SHA,runnerEnvironment:'github-hosted',issuedAt:new Date().toISOString()}
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
 const signingInput=encode({alg:'RS256',kid,typ:format})+'.'+encode(payload)
 const message=createHash('sha256').update(signingInput).digest('base64')
 const {stdout}=await run('aws',['kms','sign','--key-id',keyArn,'--signing-algorithm','RSASSA_PKCS1_V1_5_SHA_256','--message-type','DIGEST','--message',message,'--query','Signature','--output','text'],{timeout:15000,maxBuffer:16384})
 const signature=stdout.trim()
 if(!/^[a-zA-Z0-9+/]+={0,2}$/.test(signature)||Buffer.from(signature,'base64').length<256)throw new Error('KMS returned an invalid RSA signature')
 await writeFile(outputPath,JSON.stringify({format,signature:signingInput+'.'+Buffer.from(signature,'base64').toString('base64url')}),{mode:0o600,flag:'wx'})
}
main().catch(()=>{process.stderr.write('Report signing failed. Check the trusted workflow identity, report size, KMS permissions and output path.\n');process.exitCode=1})
