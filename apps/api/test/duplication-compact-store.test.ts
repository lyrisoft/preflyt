import {expect,it} from 'vitest'
// @ts-expect-error Image-owned JavaScript is also exercised by the container parity check.
import {CompactCloneStore} from '../../../docs/deployment/native-runner/duplication/compact-store.mjs'
const frame=(sourceId='src/example.js')=>({sourceId,start:{value:'source text must not be retained',loc:{start:{line:2,column:3,position:4}},range:[5,6]},end:{value:'other source text',loc:{end:{line:12,column:13,position:14}},range:[15,16]}})
it('preserves every location consumed by the pinned clone engine across slab boundaries and namespaces',async()=>{
 const store=new CompactCloneStore();store.namespace('javascript')
 for(let i=0;i<16386;i++)await store.set(String(i),frame())
 const value=await store.get('16385'),original=frame()
 expect(value.sourceId).toBe(original.sourceId)
 expect(value.start.loc.start).toEqual(original.start.loc.start)
 expect(value.end.loc.end).toEqual(original.end.loc.end)
 expect(value.start.range[0]).toBe(5);expect(value.end.range[1]).toBe(16)
 expect(JSON.stringify(store)).not.toContain('source text')
 store.namespace('python');await expect(store.get('16385')).rejects.toThrow('not found')
 await store.set('16385',frame('app.py'));expect((await store.get('16385')).sourceId).toBe('app.py')
 store.namespace('javascript');expect((await store.get('16385')).sourceId).toBe('src/example.js')
 store.close();await expect(store.get('16385')).rejects.toThrow()
})
it('rejects excessive frames and malformed locations rather than wrapping numeric evidence',async()=>{
 const store=new CompactCloneStore(1);store.namespace('javascript')
 await expect(store.set('bad',{...frame(),start:{loc:{start:{line:-1}},range:[1]}})).rejects.toThrow('Invalid clone location')
 await store.set('one',frame());await expect(store.set('two',frame())).rejects.toThrow('token limit')
})

it('does not join backwards or cross-file hash hits into an impossible clone',async()=>{
 const store=new CompactCloneStore();store.namespace('javascript')
 await store.set('first',frame())
 await store.set('backwards',{...frame(),start:{loc:{start:{line:1,column:1,position:1}},range:[0,1]}})
 await store.set('other',frame('another.js'))
 await store.get('first');await expect(store.get('backwards')).rejects.toThrow('non-contiguous')
 await store.get('first');await expect(store.get('other')).rejects.toThrow('non-contiguous')
})
