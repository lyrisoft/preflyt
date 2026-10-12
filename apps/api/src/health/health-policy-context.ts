import {digest} from '../assessments/assessment-digest.js'
import {previewGate} from '../assessments/gate-preview.js'
export type HealthPolicyContext = {
 healthRules?:Array<{id:string;required:boolean;maxFailedChecks:number}>;
 version:1; state:'NO_PUBLISHED_POLICY'|'POLICY_INVALID'|'CAPTURED';
 policyId?:string; revision?:number; definitionHash?:string; selectionId?:string;
 branchRef:string; capturedAt:string; requirements?:number;
 evidence:{state:'UNAVAILABLE'|'HISTORICAL_PREVIEW';assessmentId?:string;assessmentHash?:string;formula?:'historical-policy-evidence-v1';evaluatorVersion?:number;covered?:number;passing?:number;blocked?:number;incomplete?:number;percentage:number|null};
}
/** Read-only policy context. Never imports Health findings into policy evaluation or publication. */
export function captureHealthPolicy(policy:any, snapshot:any, sourceSha:string, branch:string, at=new Date()):HealthPolicyContext {
 const branchRef=`refs/heads/${branch}`,base={version:1 as const,branchRef,capturedAt:at.toISOString(),evidence:{state:'UNAVAILABLE' as const,percentage:null}}
 if(!policy) return {...base,state:'NO_PUBLISHED_POLICY'}
 const definition=policy.definition
 if(policy.state!=='PUBLISHED'||policy.branchRef!==branchRef||definition?.branchRef!==branchRef||definition?.selectionId!==policy.selectionId||digest(definition)!==policy.definitionHash||
  !Array.isArray(definition.rules)||definition.rules.length>64||new Set(definition.rules.map((r:any)=>r?.id)).size!==definition.rules.length||definition.rules.some((r:any)=>typeof r?.id!=='string'||typeof r.required!=='boolean')) return {...base,state:'POLICY_INVALID'}
 const result:HealthPolicyContext={...base,state:'CAPTURED',policyId:policy.id,revision:policy.revision,definitionHash:policy.definitionHash,selectionId:policy.selectionId,requirements:definition.rules.length,healthRules:definition.rules.filter((r:any)=>/^(?:security\.(?:sast|dependencies|hotspots)|secrets\.scan|iac\.policy|quality\.(?:reliability|maintainability|duplication)|tests\.coverage)$/.test(r.id)).map((r:any)=>({id:r.id,required:r.required,maxFailedChecks:Number.isSafeInteger(r.thresholds?.maxFailedChecks)&&r.thresholds.maxFailedChecks>=0?r.thresholds.maxFailedChecks:0}))}
 if(!snapshot||snapshot.sourceSha!==sourceSha||snapshot.selectionId!==policy.selectionId||snapshot.request?.selectionId!==policy.selectionId||
  digest({request:snapshot.request,plan:snapshot.plan,report:snapshot.report})!==snapshot.assessmentHash||!Array.isArray(snapshot.plan?.checks)||snapshot.plan.checks.length!==definition.rules.length||
  definition.rules.some((r:any)=>!snapshot.plan.checks.some((c:any)=>c.id===r.id&&c.required===r.required))) return result
 const preview=previewGate(snapshot)
 if(preview.rules.length!==definition.rules.length||preview.reasons.includes('SNAPSHOT_SCHEMA_UNSUPPORTED')) return result
 const passing=preview.rules.filter((r:any)=>r.status==='PASS').length,blocked=preview.rules.filter((r:any)=>r.status==='BLOCK').length,incomplete=preview.rules.filter((r:any)=>r.status==='INCOMPLETE').length
 return {...result,evidence:{state:'HISTORICAL_PREVIEW',assessmentId:snapshot.id,assessmentHash:snapshot.assessmentHash,formula:'historical-policy-evidence-v1',evaluatorVersion:preview.evaluatorVersion,covered:passing+blocked,passing,blocked,incomplete,percentage:definition.rules.length?100*(passing+blocked)/definition.rules.length:null}}
}
export async function healthPolicyContext(db:any, repositoryId:string, organizationId:string, sourceSha:string, branch:string) {
 const policy=await db.gatePolicyRevision.findFirst({where:{repositoryId,organizationId,branchRef:`refs/heads/${branch}`,state:'PUBLISHED'},orderBy:[{publishedAt:'desc'},{id:'desc'}]})
 const snapshot=policy?await db.commitAssessment.findFirst({where:{repositoryId,sourceSha,selectionId:policy.selectionId},orderBy:[{createdAt:'desc'},{id:'desc'}]}):null
 return captureHealthPolicy(policy,snapshot,sourceSha,branch)
}
