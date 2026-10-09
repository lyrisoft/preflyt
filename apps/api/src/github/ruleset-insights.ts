import { ServiceUnavailableException } from '@nestjs/common'
export type MatchedEvaluation={type:string;enforcement:string;result:string;details:string|null}
export type RulesetSuite={id:number;actor:string;ref:string;sourceSha:string;pushedAt:string;suiteResult:string;evaluationResult:string|null;rules:MatchedEvaluation[]}
const text=(value:unknown,max=4096)=>{if(typeof value!=='string'||value.length>max)throw new ServiceUnavailableException('Invalid GitHub evaluation response');return value}
/** Attribute only detailed rule_source IDs. Suite-wide results never become ruleset results. */
export function attributedSuite(value:Record<string,any>,repositoryId:string,rulesetId:number):RulesetSuite|null {
  if(!Number.isSafeInteger(value.id)||value.id<1||String(value.repository_id)!==repositoryId||!Array.isArray(value.rule_evaluations)||value.rule_evaluations.length>1000||!Number.isFinite(Date.parse(value.pushed_at))||!/^[a-f0-9]{40}$/.test(value.after_sha)||!['pass','fail','bypass'].includes(value.result))throw new ServiceUnavailableException('GitHub evaluation identity could not be verified')
  const rules=value.rule_evaluations.filter((rule:Record<string,any>)=>rule.rule_source?.type==='ruleset'&&rule.rule_source.id===rulesetId).map((rule:Record<string,any>)=>{
    if(!['active','evaluate','disabled'].includes(rule.enforcement)||!['pass','fail','bypass'].includes(rule.result))throw new ServiceUnavailableException('Unknown GitHub evaluation outcome')
    return {type:text(rule.rule_type,100),enforcement:rule.enforcement as string,result:rule.result as string,details:rule.details==null?null:text(rule.details)}
  })
  if(!rules.length)return null
  return {id:value.id,actor:text(value.actor_name,100),ref:text(value.ref,255),sourceSha:value.after_sha,pushedAt:new Date(value.pushed_at).toISOString(),suiteResult:value.result,evaluationResult:typeof value.evaluation_result==='string'?text(value.evaluation_result,100):null,rules}
}
export function summarizeRulesetSuites(suites:RulesetSuite[]) {
  const summary={suites:suites.length,ruleEvaluations:0,activePass:0,activeFail:0,evaluatePass:0,evaluateFail:0,attributedBypass:0,suiteBypassUnattributed:0}
  const failureTypes:Record<string,number>={}
  for(const suite of suites){
    if(suite.suiteResult==='bypass'&&!suite.rules.some(rule=>rule.result==='bypass'))summary.suiteBypassUnattributed++
    for(const rule of suite.rules){summary.ruleEvaluations++
      if(rule.result==='bypass')summary.attributedBypass++
      else if(rule.enforcement==='active'&&rule.result==='pass')summary.activePass++
      else if(rule.enforcement==='active'&&rule.result==='fail'){summary.activeFail++;failureTypes[rule.type]=(failureTypes[rule.type]??0)+1}
      else if(rule.enforcement==='evaluate'&&rule.result==='pass')summary.evaluatePass++
      else if(rule.enforcement==='evaluate'&&rule.result==='fail')summary.evaluateFail++
    }
  }
  return {...summary,failureTypes:Object.entries(failureTypes).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([type,count])=>({type,count}))}
}
