import { expect, it, vi } from 'vitest'
import { RepositoryHealthService } from '../src/health/repository-health.service.js'
const sha = 'a'.repeat(40)
const id = '11111111-1111-4111-8111-111111111111'
const fingerprint = 'f'.repeat(64)
function fixture() {
 const access = { requireRepository: vi.fn().mockResolvedValue({id:'repo'}) }
 const db = { repositoryHealthAssessment: { findFirst: vi.fn().mockResolvedValue({ sourceSha:sha, report:{ findings:[{fingerprint,path:'first.ts',line:1,endLine:10,category:'duplication',relatedLocations:[{path:'second.ts',line:20,endLine:30}]}] } }) } }
 const sources = { read:vi.fn().mockResolvedValue({lines:[{number:20,text:'saved match'}],reason:null}) }
 const service = Object.assign(Object.create(RepositoryHealthService.prototype), {db,access,sources}) as RepositoryHealthService
 return {service,access,db,sources}
}
it('retrieves a reported health match at its original commit and rechecks repository access', async()=>{
 const {service,access,sources}=fixture()
 const result=await service.source({organizationId:'org'} as any,'11',id,fingerprint,'1')
 expect(result).toMatchObject({path:'second.ts',line:20,endLine:30,sourceSha:sha})
 expect(sources.read).toHaveBeenCalledWith('repo',sha,expect.objectContaining({path:'second.ts',line:20}),5)
 expect(access.requireRepository).toHaveBeenCalledTimes(2)
})
it('rejects unreported locations and revoked access without returning an excerpt', async()=>{
 const {service,access,sources}=fixture()
 await expect(service.source({} as any,'11',id,fingerprint,'2')).rejects.toThrow('Choose a reported location')
 expect(sources.read).not.toHaveBeenCalled()
 access.requireRepository.mockRejectedValueOnce(new Error('Denied'))
 await expect(service.source({} as any,'11',id,fingerprint,'1')).rejects.toThrow('Denied')
 expect(sources.read).not.toHaveBeenCalled()
 access.requireRepository.mockResolvedValueOnce({id:'repo'}).mockRejectedValueOnce(new Error('Revoked'))
 await expect(service.source({} as any,'11',id,fingerprint,'1')).rejects.toThrow('Revoked')
})
