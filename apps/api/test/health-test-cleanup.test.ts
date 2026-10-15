import {expect,it,vi} from 'vitest'
import {cleanupHealthTests} from '../src/health/health-test-job.js'
const scope={requestId:'a'.repeat(36),organizationId:'org',repositoryId:'51',sourceSha:'b'.repeat(40),sourceHash:'c'.repeat(64),planHash:'d'.repeat(64)}
const tool={ruleId:'tests.coverage' as const,image:'sha256:'+'a'.repeat(64),configHash:'b'.repeat(64),toolVersion:'old',license:'MIT',reviewDigest:'c'.repeat(64),expiresAt:'2099-01-01T00:00:00Z',databaseBuiltAt:null}
it('preserves ownership checks when cleaning pre-migration test containers',async()=>{
 const command=vi.fn(async(args:string[])=>Buffer.from(args[0]==='ps'?'container':JSON.stringify([{Config:{Labels:{'preflyt.scope':'another-job'}}}])))
 await expect(cleanupHealthTests(scope,tool,command)).rejects.toThrow('ownership')
 expect(command.mock.calls.some(([args])=>args[0]==='rm'||args[0]==='create'||args[0]==='start')).toBe(false)
})
