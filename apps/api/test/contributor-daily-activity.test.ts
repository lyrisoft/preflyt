import {expect,it} from 'vitest'
import {contributorDailyActivity} from '../src/contributors/contributor-daily-activity.js'
it('counts scoped recorded participations by UTC date, deduplicates deliveries and keeps quiet days',()=>{
 const from=new Date('2026-10-01T12:00:00Z'),to=new Date('2026-10-04T12:00:00Z')
 const row={observedAt:new Date('2026-10-02T22:00:00Z'),repositoryId:'repo',relationship:'PR_AUTHOR',sourceObjectId:'42'}
 expect(contributorDailyActivity([row,row,{...row,relationship:'REVIEWER'}],from,to)).toEqual([{date:'2026-10-01',count:0},{date:'2026-10-02',count:2},{date:'2026-10-03',count:0},{date:'2026-10-04',count:0}])
})
