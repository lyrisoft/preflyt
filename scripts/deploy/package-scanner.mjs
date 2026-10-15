// Build-time only: a Docker-loadable, flattened image from a trusted build stage.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdtemp, mkdir, readFile, writeFile, rm, rename, stat } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
async function hash(file) {const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);return digest.digest('hex')}
export async function packageScanner(root,output,name,architecture) {
 if(!['gitleaks','semgrep','duplication','trivy','dependencies'].includes(name)||!['amd64','arm64'].includes(architecture))throw new Error('Invalid scanner bundle')
 const temporary=await mkdtemp(join(tmpdir(),'preflyt-image-'))
 try {
  await mkdir(output,{recursive:true})
  const layer=join(temporary,'layer.tar')
  execFileSync('tar',['--sort=name','--mtime=@0','-C',root,'-cf',layer,'.'],{stdio:'inherit'})
  const env=['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin']
  if(name==='semgrep')env.push('SEMGREP_IN_DOCKER=1','SEMGREP_USER_AGENT_APPEND=Docker','PYTHONIOENCODING=utf8','PYTHONUNBUFFERED=1')
  const config=JSON.stringify({architecture,os:'linux',config:{User:'65532:65532',WorkingDir:'/workspace',Env:env,Entrypoint:['/usr/local/bin/node','/opt/preflyt/runner.mjs']},rootfs:{type:'layers',diff_ids:['sha256:'+await hash(layer)]}})
  const blobs=join(temporary,'blobs','sha256');await mkdir(blobs,{recursive:true})
  const configDigest=createHash('sha256').update(config).digest('hex')
  await writeFile(join(blobs,configDigest),config)
  const layerDigest=await hash(layer),layerSize=(await stat(layer)).size
  await rename(layer,join(blobs,layerDigest))
  const manifest=JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.manifest.v1+json',config:{mediaType:'application/vnd.oci.image.config.v1+json',digest:'sha256:'+configDigest,size:Buffer.byteLength(config)},layers:[{mediaType:'application/vnd.oci.image.layer.v1.tar',digest:'sha256:'+layerDigest,size:layerSize}]})
  const image=createHash('sha256').update(manifest).digest('hex')
  await writeFile(join(blobs,image),manifest)
  await writeFile(join(temporary,'oci-layout'),JSON.stringify({imageLayoutVersion:'1.0.0'}))
  await writeFile(join(temporary,'index.json'),JSON.stringify({schemaVersion:2,manifests:[{mediaType:'application/vnd.oci.image.manifest.v1+json',digest:'sha256:'+image,size:Buffer.byteLength(manifest),platform:{architecture,os:'linux'}}]}))
  const archive=name+'.tar.gz',target=join(output,archive)
  execFileSync('tar',['-C',temporary,'-czf',target,'oci-layout','index.json','blobs'],{stdio:'inherit'})
  let index={version:1,images:{}}
  try{index=JSON.parse(await readFile(join(output,'bundles.json'),'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
  index.images[name]={archive,sha256:await hash(target),image:'sha256:'+image}
  await writeFile(join(output,'bundles.json'),JSON.stringify(index))
 }finally{await rm(temporary,{recursive:true,force:true})}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await packageScanner(...process.argv.slice(2))
