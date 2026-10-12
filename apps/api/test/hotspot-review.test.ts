import {expect,it} from 'vitest'
import {hotspotDispositionId,hotspotSummary} from '../src/health/hotspot-review.js'
const fingerprint='f'.repeat(64), id='assessment'
const report:any={analyses:[{id:'security.hotspots',state:'FAIL',findingsReported:1,findingsRetained:1,findingsSuppressed:0}],findings:[{fingerprint,category:'hotspot'}]}
it('counts human decisions for the exact assessment without claiming safety or fixing gates',()=>{
 const key=hotspotDispositionId(id,fingerprint)
 expect(hotspotSummary(report,[],id)).toMatchObject({reviewed:0,total:1,complete:true,percentage:0})
 for(const state of ['SAFE','FIX_REQUIRED']) expect(hotspotSummary(report,[{id:key,state}],id).percentage).toBe(100)
 expect(hotspotSummary(report,[{id:key,state:'IN_REVIEW'}],id).percentage).toBe(0)
 expect(hotspotSummary(report,[{id:key,state:'SAFE'}],'different-assessment').reviewed).toBe(0)
})
it('withholds percentages for truncated, suppressed, missing or invalid analyzer evidence and empty scope',()=>{
 for(const patch of [{findingsReported:21},{state:'INCOMPLETE'},{findingsSuppressed:1},{findingsReported:undefined}]) expect(hotspotSummary({...report,analyses:[{...report.analyses[0],...patch}]},[],id).percentage).toBeNull()
 expect(hotspotSummary(null,[],id).percentage).toBeNull()
 expect(hotspotSummary({...report,findings:[],analyses:[{...report.analyses[0],state:'PASS',findingsReported:0,findingsRetained:0}]},[],id)).toMatchObject({total:0,percentage:null,complete:true})
})
