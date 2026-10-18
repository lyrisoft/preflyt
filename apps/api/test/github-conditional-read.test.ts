import {it,expect,vi} from 'vitest'
import {conditionalGitHubRead} from '../src/github/github-conditional-read.js'
const setup=()=>{const entries=new Map<string,string>();return {entries,cache:{get:vi.fn(async(k:string)=>entries.get(k)??null),set:vi.fn(async(k:string,v:string)=>{entries.set(k,v)}),delete:vi.fn(async(k:string)=>{entries.delete(k)})} as any}}
const options={headers:{authorization:'Bearer scoped-secret',accept:'application/vnd.github+json'}}
it('revalidates and restores a conditional 304 body and pagination without storing credentials',async()=>{
 const {cache,entries}=setup(), request=vi.fn().mockResolvedValueOnce(new Response('[1]',{headers:{etag:'"v1"',link:'next'}})).mockResolvedValueOnce(new Response(null,{status:304}))
 await conditionalGitHubRead(cache,'installation:1','https://api.github.com/repos/o/r/branches',options,request)
 const response=await conditionalGitHubRead(cache,'installation:1','https://api.github.com/repos/o/r/branches',options,request)
 expect(new Headers(request.mock.calls[1][0].headers).get('if-none-match')).toBe('"v1"');expect(await response.json()).toEqual([1]);expect(response.headers.get('link')).toBe('next');expect(JSON.stringify([...entries])).not.toContain('scoped-secret')
})
it('does not send a validator across credentials or mutate requests',async()=>{
 const {cache}=setup(),request=vi.fn(async()=>new Response('{}',{headers:{etag:'"a"'}}))
 await conditionalGitHubRead(cache,'installation:1','https://api.github.com/repos/o/r',options,request)
 await conditionalGitHubRead(cache,'installation:1','https://api.github.com/repos/o/r',{headers:{authorization:'Bearer other'}},request)
 expect(new Headers(request.mock.calls[1][0]?.headers).has('if-none-match')).toBe(false)
 const write=vi.fn(async()=>new Response('{}'));await conditionalGitHubRead(cache,'installation:1','url',{...options,method:'POST'},write);expect(write).toHaveBeenCalledWith({...options,method:'POST'})
})
it('does not serve saved data for a forbidden response and invalidates its validator',async()=>{
 const {cache}=setup(),request=vi.fn().mockResolvedValueOnce(new Response('{}',{headers:{etag:'"a"'}})).mockResolvedValueOnce(new Response('{}',{status:403}))
 await conditionalGitHubRead(cache,'installation:1','url',options,request)
 expect((await conditionalGitHubRead(cache,'installation:1','url',options,request)).status).toBe(403);expect(cache.delete).toHaveBeenCalled()
})
