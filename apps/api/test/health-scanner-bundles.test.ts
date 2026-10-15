import {it,expect} from 'vitest'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {loadScannerBundle} from '../src/health/health-scanner-bundles.js'
it('loads only integrity-checked image archives and reuses the exact loaded image',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'preflyt-bundle-test-'))
 try {
  const image='sha256:'+'a'.repeat(64),archive=Buffer.from('trusted generated archive'),calls:string[][]=[]
  await writeFile(join(directory,'gitleaks.tar'),archive)
  const index={version:1,images:{gitleaks:{image,archive:'gitleaks.tar',sha256:createHash('sha256').update(archive).digest('hex')}}}
  await writeFile(join(directory,'bundles.json'),JSON.stringify(index))
  let loaded=false
  const command=async(args:string[])=>{calls.push(args);if(args[1]==='load'){loaded=true;return Buffer.from('loaded')}if(!loaded)throw new Error('absent');return Buffer.from(image)}
  expect(await loadScannerBundle(directory,'gitleaks',command)).toBe(image)
  expect(calls.filter(args=>args[1]==='load')).toHaveLength(1)
  await loadScannerBundle(directory,'gitleaks',command)
  expect(calls.filter(args=>args[1]==='load')).toHaveLength(1)
  loaded=false
  await writeFile(join(directory,'gitleaks.tar'),'tampered')
  await expect(loadScannerBundle(directory,'gitleaks',command)).rejects.toThrow('integrity')
  expect(calls.filter(args=>args[1]==='load')).toHaveLength(1)
  index.images.gitleaks.archive='../unexpected.tar'
  await writeFile(join(directory,'bundles.json'),JSON.stringify(index))
  await expect(loadScannerBundle(directory,'gitleaks',command)).rejects.toThrow('manifest')
 }finally{await rm(directory,{recursive:true,force:true})}
})
it('rejects an image load that does not establish the expected content ID',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'preflyt-bundle-test-'))
 try {
  await writeFile(join(directory,'gitleaks.tar'),'archive')
  await writeFile(join(directory,'bundles.json'),JSON.stringify({version:1,images:{gitleaks:{image:'sha256:'+'a'.repeat(64),archive:'gitleaks.tar',sha256:createHash('sha256').update('archive').digest('hex')}}}))
  await expect(loadScannerBundle(directory,'gitleaks',async()=>Buffer.from('wrong image'))).rejects.toThrow('differs')
 }finally{await rm(directory,{recursive:true,force:true})}
})

it('rejects non-string bundle digests before any Docker operation',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'preflyt-bundle-test-'))
 try {
  for(const entry of [
   {image:['sha256:'+'a'.repeat(64)],sha256:'b'.repeat(64)},
   {image:'sha256:'+'a'.repeat(64),sha256:['b'.repeat(64)]},
  ]) {
   await writeFile(join(directory,'bundles.json'),JSON.stringify({version:1,images:{gitleaks:{...entry,archive:'gitleaks.tar'}}}))
   await expect(loadScannerBundle(directory,'gitleaks',async()=>{throw new Error('Docker must not be called')})).rejects.toThrow('manifest')
  }
 }finally{await rm(directory,{recursive:true,force:true})}
})
