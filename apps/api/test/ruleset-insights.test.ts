import { afterEach, describe, expect, it, vi } from 'vitest'
import { attributedSuite, summarizeRulesetSuites } from '../src/github/ruleset-insights.js'
import { GitHubProviderService } from '../src/github/github-provider.service.js'
import { GitHubRulesetService } from '../src/github/github-ruleset.service.js'
const rule=(id:number,result='pass',enforcement='active')=>({rule_source:{type:'ruleset',id},rule_type:'required_status_checks',result,enforcement,details:'Checks evaluated'})
const suite=(rules=[rule(7)])=>({id:10,repository_id:501,actor_name:'developer',ref:'refs/heads/main',after_sha:'a'.repeat(40),pushed_at:'2026-10-09T12:00:00Z',result:'pass',evaluation_result:'pass',rule_evaluations:rules})
afterEach(()=>vi.restoreAllMocks())
describe('ruleset attribution',()=>{
 it('attributes detailed rule source IDs, never a suite-wide result',()=>{
  const matched=attributedSuite(suite([rule(8),rule(7,'fail'),rule(7,'fail','evaluate')]),'501',7)!
  expect(matched.rules).toHaveLength(2)
  expect(summarizeRulesetSuites([matched])).toMatchObject({activePass:0,activeFail:1,evaluateFail:1,ruleEvaluations:2,failureTypes:[{type:'required_status_checks',count:1}]})
  expect(attributedSuite(suite([rule(8)]),'501',7)).toBeNull()
 })
 it('does not assign suite-wide bypasses to a particular ruleset',()=>{
  const matched=attributedSuite({...suite(),result:'bypass'},'501',7)!
  expect(summarizeRulesetSuites([matched])).toMatchObject({attributedBypass:0,suiteBypassUnattributed:1})
  expect(summarizeRulesetSuites([attributedSuite({...suite([rule(7,'bypass')]),result:'bypass'},'501',7)!])).toMatchObject({attributedBypass:1,suiteBypassUnattributed:0})
 })
 it.each([{repository_id:502},{after_sha:'short'},{pushed_at:'invalid'},{result:'unknown'},{rule_evaluations:[rule(7,'unknown')]}])('rejects unverifiable details %j',change=>{
  expect(()=>attributedSuite({...suite(),...change},'501',7)).toThrow()
 })
 it('empty history reports zero counts without inventing a pass rate',()=>{
  expect(summarizeRulesetSuites([])).toMatchObject({suites:0,activePass:0,activeFail:0,ruleEvaluations:0})
  expect(summarizeRulesetSuites([])).not.toHaveProperty('passRate')
 })
})
function providerFixture(rows:any[]=[suite()]) {
 const provider=new GitHubProviderService() as any
 vi.spyOn(provider,'verifyInstallation').mockResolvedValue({permissions:{administration:'read'}})
 const request=vi.fn(async(path:string)=>path.includes('?')?rows:suite([rule(7,'fail'),rule(8)]))
 const open=vi.spyOn(provider,'openRepository').mockResolvedValue({metadata:{owner:{login:'fixture'},name:'app',full_name:'fixture/app'},request})
 return {provider,request,open}
}
describe('GitHub Insights reader',()=>{
 it('uses isolated administration read and filters matching rule results before counting',async()=>{
  const {provider,request,open}=providerFixture()
  try {
   const result=await provider.readRulesetInsights(500n,501n,7,{page:2,period:'week',actor:'developer',ref:'refs/heads/main',result:'fail'})
   expect(open).toHaveBeenCalledWith(500n,501n,'administration')
   expect(request.mock.calls[0][0]).toContain('rule_suite_result=all')
   expect(request.mock.calls[0][0]).toContain('page=2')
   expect(result).toMatchObject({scope:'CURRENT_GITHUB_PAGE',counting:'MATCHED_RULE_OCCURRENCES',hasMore:false,scannedSuites:1,summary:{activeFail:1,activePass:0}})
   expect(result.suites[0].rules).toHaveLength(1)
  } finally {provider.close()}
 })
 it.each([{rows:[{...suite(),repository_id:999}]},{rows:[suite(),suite()]}])('rejects foreign or duplicate suites',async ({rows})=>{
  const {provider}=providerFixture(rows)
  try {await expect(provider.readRulesetInsights(500n,501n,7,{page:1,period:'week'})).rejects.toThrow()} finally{provider.close()}
 })
 it('requires repository administration access before reading evaluations',async()=>{
  const {provider,open}=providerFixture()
  vi.spyOn(provider,'verifyInstallation').mockResolvedValue({permissions:{metadata:'read'}})
  try {await expect(provider.readRulesetInsights(500n,501n,7,{page:1,period:'week'})).rejects.toThrow('Administration');expect(open).not.toHaveBeenCalled()}finally{provider.close()}
 })
 it('does not return partial counts when a suite detail fails',async()=>{
  const {provider,request}=providerFixture()
  request.mockImplementation(async(path:string)=>{if(path.includes('?'))return [suite()];throw new Error('unavailable')})
  try {await expect(provider.readRulesetInsights(500n,501n,7,{page:1,period:'week'})).rejects.toThrow('unavailable')}finally{provider.close()}
 })
})
describe('Insights authorization',()=>{
 it('rechecks repository access after reading and rejects revocation',async()=>{
  const access={requireRepository:vi.fn().mockResolvedValueOnce({installationId:500n,githubId:501n}).mockRejectedValueOnce(new Error('Access revoked'))}
  const provider={getRepositoryRuleset:vi.fn().mockResolvedValue({}),readRulesetInsights:vi.fn().mockResolvedValue({summary:{activePass:1}})}
  const service=new GitHubRulesetService(access as any,provider as any)
  await expect(service.insights({} as any,'501',7,{page:1,period:'week'})).rejects.toThrow('Access revoked')
  expect(access.requireRepository).toHaveBeenCalledWith({},'501','policy.read')
 })
 it('denies ungranted repositories before contacting GitHub',async()=>{
  const access={requireRepository:vi.fn().mockRejectedValue(new Error('Denied'))}
  const provider={getRepositoryRuleset:vi.fn()}
  await expect(new GitHubRulesetService(access as any,provider as any).insights({} as any,'501',7,{page:1,period:'week'})).rejects.toThrow('Denied')
  expect(provider.getRepositoryRuleset).not.toHaveBeenCalled()
 })
 it.each([{page:0,period:'week'},{page:1,period:'year'},{page:1,period:'week',ref:'*'},{page:1,period:'week',result:'success'}])('rejects invalid filters before GitHub reads',async options=>{
  const access={requireRepository:vi.fn()}
  await expect(new GitHubRulesetService(access as any,{} as any).insights({} as any,'501',7,options)).rejects.toThrow('Invalid Insights')
  expect(access.requireRepository).not.toHaveBeenCalled()
 })
})

it('rechecks assessment permissions after linking exact commit evidence', async () => {
 const access = { requireRepository: vi.fn().mockResolvedValue({ id: 'internal', installationId: 500n, githubId: 501n }) };
 const provider = { getRepositoryRuleset: vi.fn().mockResolvedValue({}), readRulesetInsights: vi.fn().mockResolvedValue({ suites: [] }) };
 const history = { linkAssessments: vi.fn(async () => { access.requireRepository.mockRejectedValue(new Error('Access revoked')); return []; }) };
 await expect(new GitHubRulesetService(access as any, provider as any, history as any).insights({} as any, '501', 7, { page: 1, period: 'week' })).rejects.toThrow('Access revoked');
 expect(history.linkAssessments).toHaveBeenCalledWith('internal', []);
 expect(access.requireRepository).toHaveBeenCalledWith({}, '501', 'assessment.read');
});
