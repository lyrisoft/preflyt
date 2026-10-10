import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitHubProviderService } from '../src/github/github-provider.service.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('GitHubProviderService', () => {
  it('revokes only the temporary user token, without revoking the app grant', async () => {
    vi.stubEnv('GITHUB_APP_CLIENT_ID', 'Iv1.test-client')
    vi.stubEnv('GITHUB_APP_CLIENT_SECRET', 'test-client-secret')
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await new GitHubProviderService().revokeUserToken('ghu-temporary-token')

    const [url, options] = fetchMock.mock.calls[0]!
    expect(url).toBe(
      'https://api.github.com/applications/Iv1.test-client/token',
    )
    expect(options).toMatchObject({
      method: 'DELETE',
      body: JSON.stringify({ access_token: 'ghu-temporary-token' }),
    })
  })
})

it('reads PR context using isolated read-only PR permissions and validates its number',async()=>{
 const provider=new GitHubProviderService() as any
 const request=vi.fn(async()=>({id:99,number:7,state:'open',draft:false,merged:false,updated_at:new Date().toISOString(),head:{repo:{id:501},ref:'feature/test',sha:'a'.repeat(40)},base:{repo:{id:501},ref:'development',sha:'b'.repeat(40)}}))
 const open=vi.spyOn(provider,'openRepository').mockResolvedValue({metadata:{owner:{login:'fixture'},name:'app'},request})
 const result=await provider.readPullRequest(500n,501n,7)
 expect(open).toHaveBeenCalledWith(500n,501n,'pull_requests');expect(request).toHaveBeenCalledWith('/repos/fixture/app/pulls/7');expect(result.context.head.sha).toBe('a'.repeat(40))
 await expect(provider.readPullRequest(500n,501n,8)).rejects.toThrow('context');provider.close()
})

it('keeps PR and contents token caches separate with least-privilege minting',async()=>{
 const provider=new GitHubProviderService(undefined,{gitHubInstallation:{findUnique:async()=>({accessRevision:3})}} as any) as any
 const mint=vi.spyOn(provider,'appRequest').mockResolvedValue({data:{token:'test-token',expires_at:new Date(Date.now()+3600000).toISOString()}})
 await provider.installationToken(500n,501n);await provider.installationToken(500n,501n,'pull_requests');await provider.installationToken(500n,501n,'pull_requests')
 expect(mint).toHaveBeenCalledTimes(2)
 expect(mint.mock.calls[0][1]).toMatchObject({repository_ids:[501],permissions:{metadata:'read',contents:'read'}})
 expect(mint.mock.calls[1][1]).toMatchObject({repository_ids:[501],permissions:{metadata:'read',pull_requests:'read'}})
 expect((mint.mock.calls[1][1] as any).permissions).not.toHaveProperty('contents');provider.close()
})

it('rejects a PR diff when the live head changes during file collection', async () => {
  const provider=new GitHubProviderService() as any
  const context={version:1,head:{repositoryId:'501',ref:'feature',sha:'a'.repeat(40)},base:{repositoryId:'501',ref:'main',sha:'b'.repeat(40)},state:'open',draft:false,merged:false}
  const read=vi.spyOn(provider,'readPullRequest').mockResolvedValueOnce({context}).mockResolvedValueOnce({context:{...context,head:{...context.head,sha:'c'.repeat(40)}}})
  vi.spyOn(provider,'openRepository').mockResolvedValue({metadata:{owner:{login:'fixture'},name:'app'},request:vi.fn(async()=>[{filename:'x.ts',patch:'@@ -0,0 +1 @@\n+changed'}])})
  await expect(provider.readPrReviewSource(500n,501n,7,context)).rejects.toThrow()
  expect(read).toHaveBeenCalledTimes(2)
  provider.close()
})
