import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {packageScanner} from './package-scanner.mjs'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
test('produces a complete OCI graph with the exact importable manifest ID',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'preflyt-archive-test-'))
 try{
  const root=join(directory,'root'),output=join(directory,'output'),unpacked=join(directory,'unpacked')
  await mkdir(root);await mkdir(unpacked);await writeFile(join(root,'fixture'),'trusted generated fixture')
  await packageScanner(root,output,'gitleaks','arm64')
  const bundle=JSON.parse(await readFile(join(output,'bundles.json'),'utf8')).images.gitleaks
  assert.equal(sha(await readFile(join(output,bundle.archive))),bundle.sha256)
  execFileSync('tar',['-C',unpacked,'-xzf',join(output,bundle.archive)])
  const index=JSON.parse(await readFile(join(unpacked,'index.json'),'utf8'))
  assert.equal(index.manifests[0].digest,bundle.image)
  const blob=async descriptor=>{
   const bytes=await readFile(join(unpacked,'blobs','sha256',descriptor.digest.slice(7)))
   assert.equal('sha256:'+sha(bytes),descriptor.digest);assert.equal(bytes.length,descriptor.size);return bytes
  }
  const manifest=JSON.parse(await blob(index.manifests[0])),config=JSON.parse(await blob(manifest.config))
  await blob(manifest.layers[0])
  assert.equal(config.rootfs.diff_ids[0],manifest.layers[0].digest)
  assert.equal(config.config.User,'65532:65532');assert.equal(config.architecture,'arm64')
  assert.deepEqual(config.config.Entrypoint,['/usr/local/bin/node','/opt/preflyt/runner.mjs'])
  await assert.rejects(packageScanner(root,output,'unknown','arm64'),/Invalid/)
 }finally{await rm(directory,{recursive:true,force:true})}
})
