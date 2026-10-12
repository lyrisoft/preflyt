import { expect, it } from 'vitest'
import { sourceExcerpt } from '../src/findings/source-excerpt.js'
it('retains the reported block and its exact line numbers with bounded context',()=>{
 const result=sourceExcerpt(Array.from({length:100},(_,i)=>'line '+(i+1)).join('\n'),20,25)
 expect(result.lines[0]).toEqual({number:12,text:'line 12'})
 expect(result.lines.at(-1)).toEqual({number:33,text:'line 33'})
 expect(result.reason).toBeNull()
 expect(sourceExcerpt('first\nsecond',8).lines).toEqual([])
 expect(sourceExcerpt('first\nsecond',1,8).reason).toContain('outside')
})
it('redacts private keys and credential assignments without moving line numbers',()=>{
 const result=sourceExcerpt('first\napi_key="private-value"\n-----BEGIN RSA PRIVATE KEY-----\nkey-value\n-----END RSA PRIVATE KEY-----\nlast',6)
 expect(result.lines[5]).toEqual({number:6,text:'last'})
 expect(JSON.stringify(result)).not.toContain('private-value')
 expect(JSON.stringify(result)).not.toContain('key-value')
 expect(result.lines.filter(l=>l.text==='[Sensitive source line hidden]')).toHaveLength(4)
})
it('does not invent coordinates for a file-only finding or return an unbounded block',()=>{
 const text=Array.from({length:200},(_,i)=>'line '+i).join('\n')
 expect(sourceExcerpt(text,null).lines).toHaveLength(30)
 expect(sourceExcerpt(text,null).truncated).toBe(true)
 const block=sourceExcerpt(text,10,180)
 expect(block.lines).toHaveLength(60)
 expect(block.truncated).toBe(true)
})
