import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { gitObjectHash, readPinnedNativeSource, safeSourcePath, sourceLimits, validateSourceBlob, validateSourceTree, verifyNativeSourceBundle, type GitSourceEntry } from '../src/execution/native-source.js'
import { GitHubProviderService } from '../src/github/github-provider.service.js'
let dir:string, treeSha:string, nestedSha:string
const text=Buffer.from('version 1\n'), binary=Buffer.from([0,255,1,128])
const blobSha=gitObjectHash('blob',text), binarySha=gitObjectHash('blob',binary)
const treeEntries=():GitSourceEntry[]=>[
  {path:'a.txt',type:'blob',mode:'100644',sha:blobSha,size:text.length},
  {path:'src',type:'tree',mode:'040000',sha:nestedSha},
  {path:'src/b.bin',type:'blob',mode:'100755',sha:binarySha,size:binary.length},
]
const blob=(sha:string)=>({sha,size:sha===blobSha?text.length:binary.length,encoding:'base64',content:(sha===blobSha?text:binary).toString('base64')})
const git=(args:string[],input?:string|Buffer)=>execFileSync('git',['-C',dir,...args],{input,encoding:'utf8'}).trim()
beforeAll(()=>{
  dir=mkdtempSync(join(tmpdir(),'preflyt-source-contract-'))
  git(['init','--bare','--quiet'])
  expect(git(['hash-object','-w','--stdin'],text)).toBe(blobSha)
  git(['hash-object','-w','--stdin'],binary)
  nestedSha=git(['mktree'],`100755 blob ${binarySha}\tb.bin\n`)
  treeSha=git(['mktree'],`100644 blob ${blobSha}\ta.txt\n040000 tree ${nestedSha}\tsrc\n`)
})
afterAll(()=>{if(dir)rmSync(dir,{recursive:true,force:true})})
const request=()=>vi.fn(async(path:string)=>{
  if(path.includes('/git/commits/'))return {sha:'a'.repeat(40),tree:{sha:treeSha}}
  if(path.includes('/git/trees/'))return {sha:treeSha,truncated:false,tree:treeEntries()}
  return {...blob(path.split('/').at(-1)!), token:'never-return-this-token'}
})
const read=(fn=request(),signal?:AbortSignal)=>readPinnedNativeSource(fn as any,'/repos/fixture/native','51','a'.repeat(40),signal)
describe('credential-free pinned source',()=>{
  it('matches real Git blob and nested tree hashes, preserves executable bits and binary bytes',async()=>{
    expect(blobSha).toBe('83baae61804e65cc73a7201a7252750c76066a30')
    expect(validateSourceTree({sha:treeSha,truncated:false,tree:treeEntries()},treeSha)).toHaveLength(3)
    const source=await read()
    expect(source.files[1].mode).toBe('100755')
    expect(Buffer.from(source.files[1].content,'base64')).toEqual(binary)
    expect(source.totalBytes).toBe(text.length+binary.length)
    expect(verifyNativeSourceBundle(source)).toEqual(source)
    expect(JSON.stringify(source)).not.toContain('never-return-this-token')
  })
  it('uses exact commits and object SHAs, never a moving branch',async()=>{
    const fn=request();await read(fn)
    expect(fn.mock.calls[0][0]).toBe('/repos/fixture/native/git/commits/'+ 'a'.repeat(40))
    expect(fn.mock.calls[1][0]).toContain(treeSha)
    await expect(readPinnedNativeSource(fn as any,'/repos/fixture/native','51','main')).rejects.toThrow()
  })
  it.each(['../file','/file','a/../b','a//b','a/./b','a\\b','.git/config','dir/.GIT/hooks/run','C:/file','bad\0name','bad\nname','a/'.repeat(40)+'f','e\u0301.txt'])('rejects unsafe source path %j',path=>expect(safeSourcePath(path)).toBe(false))
  it('rejects duplicate/case-colliding paths, symlinks, submodules and missing parent trees',()=>{
    for(const tree of [[...treeEntries(),treeEntries()[0]],[...treeEntries(),{...treeEntries()[0],path:'A.txt'}],[{...treeEntries()[0],mode:'120000'}],[{path:'module',mode:'160000',type:'commit',sha:blobSha}],[{...treeEntries()[0],path:'missing/file'}]])expect(()=>validateSourceTree({sha:treeSha,truncated:false,tree},treeSha)).toThrow()
  })
  it('rejects altered root/nested trees and truncated or oversized inventories',()=>{
    for(const body of [{sha:'b'.repeat(40),truncated:false,tree:treeEntries()},{sha:treeSha,truncated:true,tree:treeEntries()},{sha:treeSha,truncated:false,tree:treeEntries().map(e=>e.path==='src'?{...e,sha:'b'.repeat(40)}:e)},{sha:treeSha,truncated:false,tree:Array.from({length:sourceLimits.entries+1},()=>treeEntries()[0])}])expect(()=>validateSourceTree(body,treeSha)).toThrow()
  })
  it('does not silently skip oversized files or unknown byte lengths',()=>{
    for(const size of [-1,undefined,sourceLimits.fileBytes+1,1.1])expect(()=>validateSourceTree({sha:treeSha,truncated:false,tree:[{...treeEntries()[0],size}]},treeSha)).toThrow()
  })
  it('rejects malformed/corrupt blobs and does not mistake LFS pointers for source files',()=>{
    for(const patch of [{sha:'f'.repeat(40)},{content:'broken%data'},{content:Buffer.from('changed').toString('base64')},{encoding:'utf8'},{size:0},{content:'Zh=='}])expect(()=>validateSourceBlob({...blob(blobSha),...patch},treeEntries()[0])).toThrow()
    const bytes=Buffer.from('version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 100\n')
    const file={...treeEntries()[0],size:bytes.length,sha:gitObjectHash('blob',bytes)}
    expect(()=>validateSourceBlob({sha:file.sha,size:file.size,encoding:'base64',content:bytes.toString('base64')},file)).toThrow()
  })
  it('cancels before any reads and stops future blob work after an error',async()=>{
    const controller=new AbortController();controller.abort()
    const fn=request();await expect(read(fn,controller.signal)).rejects.toThrow();expect(fn).not.toHaveBeenCalled()
    const failing=request();failing.mockImplementation(async path=>{if(path.includes('/blobs/'))throw new Error('Provider unavailable');return request()(path)})
    await expect(read(failing)).rejects.toThrow('Provider unavailable')
    expect(failing.mock.calls).toHaveLength(4)
  })
  it('rejects a changed provider commit identity',async()=>{
    await expect(read(vi.fn(async()=>({sha:'b'.repeat(40),tree:{sha:treeSha}})) as any)).rejects.toThrow()
  })
  it('detects content, file, root, scope and manifest tampering at receiver',async()=>{
    const source=await read()
    for(const patch of [{sourceHash:'c'.repeat(64)},{repositoryId:'52'},{sourceSha:'b'.repeat(40)},{totalBytes:0},{treeSha:'b'.repeat(40)},{files:source.files.slice(1)},{credential:'never'},{files:source.files.map((f,i)=>i?f:{...f,sha256:'c'.repeat(64)})},{files:source.files.map((f,i)=>i?f:{...f,content:Buffer.from('changed').toString('base64')})}])expect(()=>verifyNativeSourceBundle({...source,...patch})).toThrow()
  })
  it('the provider uses a repository-scoped contents reader and exports no token',async()=>{
    const provider=new GitHubProviderService() as any
    const reader=vi.spyOn(provider,'openRepository').mockResolvedValue({metadata:{owner:{login:'fixture'},name:'native'},request:request()})
    const signal=new AbortController().signal
    const result=await provider.readNativeSource(500n,51n,'a'.repeat(40),signal)
    expect(reader).toHaveBeenCalledWith(500n,51n,'contents',signal)
    expect(result.repositoryId).toBe('51');expect(JSON.stringify(result)).not.toContain('never-return-this-token')
    provider.close()
  })
})
