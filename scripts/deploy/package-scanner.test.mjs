import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm,truncate,stat} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {gunzipSync} from 'node:zlib'
import {fileURLToPath} from 'node:url'
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
  execFileSync('tar',['-C',unpacked,'-xf',join(output,bundle.archive)])
  const index=JSON.parse(await readFile(join(unpacked,'index.json'),'utf8'))
  assert.equal(index.manifests[0].digest,bundle.image)
  const blob=async descriptor=>{
   const bytes=await readFile(join(unpacked,'blobs','sha256',descriptor.digest.slice(7)))
   assert.equal('sha256:'+sha(bytes),descriptor.digest);assert.equal(bytes.length,descriptor.size);return bytes
  }
  const manifest=JSON.parse(await blob(index.manifests[0])),config=JSON.parse(await blob(manifest.config))
  const layer=await blob(manifest.layers[0])
  assert.equal(manifest.layers[0].mediaType,'application/vnd.oci.image.layer.v1.tar+gzip')
  assert.equal(config.rootfs.diff_ids[0],'sha256:'+sha(gunzipSync(layer)))
  assert.equal(config.config.User,'65532:65532');assert.equal(config.architecture,'arm64')
  assert.deepEqual(config.config.Entrypoint,['/usr/local/bin/node','/opt/preflyt/runner.mjs'])
  await assert.rejects(packageScanner(root,output,'unknown','arm64'),/Invalid/)
 }finally{await rm(directory,{recursive:true,force:true})}
})

test('packages a 128 MiB filesystem under a 2 MiB output-file limit',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'preflyt-stream-test-'))
 try{
  const root=join(directory,'root'),output=join(directory,'output')
  await mkdir(root);const source=join(root,'large-fixture');await writeFile(source,'');await truncate(source,128*1024*1024)
  execFileSync('sh',['-c','ulimit -f 2048; exec "$@"','preflyt-bounded-packer',process.execPath,fileURLToPath(new URL('./package-scanner.mjs',import.meta.url)),root,output,'dependencies','amd64'])
  assert.ok((await stat(join(output,'dependencies.tar'))).size<1024*1024)
 }finally{await rm(directory,{recursive:true,force:true})}
})
