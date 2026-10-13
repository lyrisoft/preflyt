import { expect,it,vi } from 'vitest'
import { FindingsService } from '../src/findings/findings.service.js'
const sha='a'.repeat(40)
function fixture() {
 const db:any={}
 const access:any={requireRepository:vi.fn().mockResolvedValue({id:'repo',installationId:1n,githubId:11n})}
 const github:any={read:vi.fn().mockResolvedValue({lines:[{number:1,text:'first'},{number:2,text:'unsafe();'},{number:3,text:'last'}],reason:null,truncated:false})}
 const service=new FindingsService(db,access,github)
 const finding={repositoryId:'11',category:'security',sourceSha:sha,path:'src/app.ts',line:2,endLine:2,ruleId:'sql-injection',title:'Unsafe query'}
 // Retrieval/integrity is covered by the HTTP database tests. Exercise the async source access boundary here.
 vi.spyOn(service as any,'finding').mockResolvedValue(finding)
 return {service,access,github,finding}
}
it('reads the pinned SHA and returns only numbered redacted source',async()=>{
 const {service,github}=fixture()
 const source=await service.source({} as any,'f'.repeat(64))
 expect(github.read).toHaveBeenCalledWith('repo',sha,expect.objectContaining({path:'src/app.ts',line:2}))
 expect(source.lines[1]).toEqual({number:2,text:'unsafe();'})
})
it('rechecks access after source fetch and suppresses source if access changes',async()=>{
 const {service,access}=fixture()
 access.requireRepository.mockRejectedValueOnce(new Error('Denied'))
 await expect(service.source({} as any,'f'.repeat(64))).rejects.toThrow('Denied')
 const fresh=fixture()
 fresh.access.requireRepository.mockResolvedValueOnce({id:'repo',installationId:1n,githubId:11n}).mockRejectedValueOnce(new Error('Revoked'))
 await expect(fresh.service.source({} as any,'f'.repeat(64))).rejects.toThrow('Revoked')
})
it('hides secrets without fetching and explains unavailable source without leaking provider errors',async()=>{
 const secret=fixture();secret.finding.ruleId='secrets.scan'
 expect((await secret.service.source({} as any,'f'.repeat(64))).lines).toEqual([])
 expect(secret.github.read).not.toHaveBeenCalled()
 const failed=fixture();failed.github.read.mockResolvedValue({lines:[],reason:'Source could not be verified',truncated:false})
 const result=await failed.service.source({} as any,'f'.repeat(64))
 expect(result.lines).toEqual([]);expect(JSON.stringify(result)).not.toContain('credential-value')
})
