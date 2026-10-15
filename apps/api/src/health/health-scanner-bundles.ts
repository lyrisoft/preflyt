import {createHash} from 'node:crypto'
import {createReadStream} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {dockerCommand} from '../execution/native-docker-job.js'

/** Deployment-owned archives only. No repository image, tag or path is accepted. */
export async function loadScannerBundle(directory:string,name:string,command:typeof dockerCommand=dockerCommand) {
 if(!['gitleaks','semgrep','duplication','trivy','dependencies'].includes(name))throw new Error('Unknown bundled scanner')
 const index=JSON.parse(await readFile(join(directory,'bundles.json'),'utf8'))
 const entry=index?.version===1?index.images?.[name]:undefined
 if(!entry||typeof entry.image!=='string'||typeof entry.sha256!=='string'||entry.archive!==name+'.tar.gz'||!/^sha256:[a-f0-9]{64}$/.test(entry.image)||!/^[a-f0-9]{64}$/.test(entry.sha256))throw new Error('Invalid scanner bundle manifest')
 // Content-addressed engine images can be reused after a service restart.
 let existing=false
 try{existing=(await command(['image','inspect',entry.image,'--format','{{.Id}}'])).toString().trim()===entry.image}catch{}
 if(!existing){
  const archive=join(directory,entry.archive),hash=createHash('sha256')
  for await(const chunk of createReadStream(archive))hash.update(chunk)
  if(hash.digest('hex')!==entry.sha256)throw new Error('Scanner archive integrity check failed')
  await command(['image','load','--input',archive],{timeoutMs:300000,maxBytes:512000})
  const loaded=(await command(['image','inspect',entry.image,'--format','{{.Id}}'])).toString().trim()
  if(loaded!==entry.image)throw new Error('Loaded scanner image differs from its bundle')
 }
 return entry.image as string
}
