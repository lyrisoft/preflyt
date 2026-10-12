import { expect, it } from 'vitest'
import { findingGuidance } from '../src/health/finding-guidance.js'
import { healthReport } from '../src/health/health-report.js'

it('matches only exact rule segments within the expected analyzer', () => {
 expect(findingGuidance('quality.reliability', 'opt.preflyt.config.preflyt-js-nan-comparison')).toMatchObject({version:2,rule:'preflyt-js-nan-comparison'})
 for (const id of ['unknown', 'preflyt-js-nan-comparison-evil', 'password=secretvalue', null]) expect(findingGuidance('quality.reliability', id)).toBeUndefined()
 expect(findingGuidance('security.sast','preflyt-js-nan-comparison')).toBeUndefined()
 expect(findingGuidance('security.sast','__proto__')).toBeUndefined()
})
it('provides explanation, action and limits for every packaged rule', () => {
 const rules = {'security.sast':['preflyt-js-eval','preflyt-python-dynamic-execution','preflyt-python-sql-fstring'], 'quality.reliability':['preflyt-js-nan-comparison','preflyt-python-bare-except','preflyt-js-async-promise-executor','preflyt-python-return-finally'], 'quality.maintainability':['preflyt-no-debugger','preflyt-python-exec-statement','preflyt-python-mutable-default'], 'security.hotspots':['preflyt-js-md5-review','preflyt-python-md5-review'], 'quality.duplication':['preflyt-duplicate-block-v1']}
 for(const [check,ids] of Object.entries(rules)) for(const id of ids) {
  const guidance=findingGuidance(check,id)!
  expect(guidance.why.length).toBeGreaterThan(30);expect(guidance.fix.length).toBeGreaterThan(30);expect(guidance.limits.length).toBeGreaterThan(30)
  expect(JSON.stringify(guidance).length).toBeLessThan(1600)
 }
})
it('saves guidance without changing scanner identities or evidence and returns independent copies', () => {
 const finding:any={fingerprint:'a'.repeat(64),ruleId:'preflyt-js-nan-comparison',title:'NaN comparison',path:'app.js',line:3,severity:'high',category:'reliability',suppressed:false}
 const check:any={ruleId:'quality.reliability',state:'FAIL',reason:'FINDINGS_REPORTED',cleanupConfirmed:true,coverage:'FULL_RULE',summary:{results:1},findings:[finding]}
 const report=healthReport({complete:true,fileCount:1,languages:['JavaScript']},[{id:check.ruleId,title:'Reliability',state:'UNAVAILABLE',reason:'READY'}],[check])
 expect(report.findings[0]).toMatchObject({ruleId:finding.ruleId,title:finding.title,line:3,evidence:'ANALYZER_REPORTED',guidance:{version:2,source:'PREFLYT_RULE_GUIDANCE'}})
 expect(check.findings[0].guidance).toBeUndefined()
 const saved=JSON.parse(JSON.stringify(report))
 report.findings[0].guidance!.why='changed copy'
 expect(saved.findings[0].guidance.why).toContain('NaN')
 expect(findingGuidance(check.ruleId,finding.ruleId)!.why).toContain('NaN')
})

it('provides safe category guidance for secret findings without repeating the value or detector text',()=>{
 const guide=findingGuidance('secrets.scan','password=never-copy-this')!
 expect(guide.rule).toBe('secret-detection')
 expect(guide.fix).toContain('revoke or rotate')
 expect(guide.limits).toContain('general secret-detection guidance')
 expect(JSON.stringify(guide)).not.toContain('never-copy-this')
})
