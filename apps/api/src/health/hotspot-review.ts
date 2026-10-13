import {digest} from '../assessments/assessment-digest.js'
import type {HealthReport} from './health-report.js'
export const hotspotStates=['TO_REVIEW','IN_REVIEW','SAFE','FIX_REQUIRED'] as const
export const hotspotDispositionId=(assessmentId:string,fingerprint:string)=>digest(['preflyt-hotspot-review-v1',assessmentId,fingerprint])
export function hotspotSummary(report:HealthReport|null,reviews:Array<{id:string;state:string}>,assessmentId:string) {
 const analysis=report?.analyses.find(a=>a.id==='security.hotspots')
 const findings=report?.findings.filter(f=>f.category==='hotspot')??[]
 const reviewed=findings.filter(f=>reviews.some(r=>r.id===hotspotDispositionId(assessmentId,f.fingerprint)&&['SAFE','FIX_REQUIRED'].includes(r.state))).length
 const complete=!!analysis && ['PASS','FAIL'].includes(analysis.state) && analysis.findingsReported!==undefined && analysis.findingsRetained===analysis.findingsReported && (analysis.findingsSuppressed??0)===0
 return {version:1,formula:'reviewed-retained-hotspots-v1',reviewed,total:findings.length,complete,percentage:complete && findings.length>0?100*reviewed/findings.length:null}
}
