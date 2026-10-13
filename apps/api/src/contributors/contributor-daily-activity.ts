type Observation={observedAt:Date;repositoryId:string;relationship:string;sourceObjectId:string}
/** Recorded participations per UTC day; duplicate deliveries do not add activity. */
export function contributorDailyActivity(rows:Observation[],from:Date,to:Date) {
 const counts=new Map<string,Set<string>>()
 for(const row of rows) {
  const date=row.observedAt.toISOString().slice(0,10), ids=counts.get(date)??new Set<string>()
  ids.add(`${row.repositoryId}:${row.relationship}:${row.sourceObjectId}`);counts.set(date,ids)
 }
 const result:Array<{date:string;count:number}>=[]
 for(let day=new Date(from);day<=to&&result.length<181;day.setUTCDate(day.getUTCDate()+1)) {
  const date=day.toISOString().slice(0,10);result.push({date,count:counts.get(date)?.size??0})
 }
 return result
}
