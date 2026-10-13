// Trusted image-owned verification of the actual mounted bytes, not only a host path.
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, opendir, open } from 'node:fs/promises'
import { join } from 'node:path'
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,canonical(v)])) : value
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const objectHash = (type, bytes) => createHash('sha1').update(type+' '+bytes.length+'\0').update(bytes).digest('hex')
const safe = path => path && Buffer.byteLength(path)<=512 && path.normalize('NFC')===path && !/[\\\x00-\x1f\x7f]/.test(path) &&
  path.split('/').length<=32 && path.split('/').every(p=>p&&p!=='.'&&p!=='..'&&p.toLowerCase()!=='.git'&&!p.includes(':')&&Buffer.byteLength(p)<=255)
export async function verifyMountedNativeSource(root, scope) {
  if (!/^[1-9]\d{0,15}$/.test(scope.repositoryId) || !/^[a-f0-9]{40}$/.test(scope.sourceSha) || !/^[a-f0-9]{64}$/.test(scope.sourceHash))
    throw new Error('Invalid source scope')
  const tree=[], files=[], paths=new Set();let totalBytes=0
  const visit=async(relative)=>{
    const directory=join(root,relative), stat=await lstat(directory)
    if (!stat.isDirectory()||stat.isSymbolicLink()) throw new Error('Invalid source directory')
    const children=[]
    for await (const entry of await opendir(directory)) {
      const name = entry.name
      const path=relative ? relative+'/'+name : name
      if (!safe(path)||paths.has(path.toLowerCase())||paths.size>=10000) throw new Error('Invalid source path')
      paths.add(path.toLowerCase())
      const info=await lstat(join(root,path))
      if(info.isSymbolicLink()) throw new Error('Source symlink is not allowed')
      if(info.isDirectory()) {
        const sha=await visit(path), entry={path,type:'tree',mode:'040000',sha}
        tree.push(entry);children.push(entry)
      } else if(info.isFile()) {
        if(files.length>=2000||info.size>2097152||totalBytes+info.size>20971520) throw new Error('Source exceeds bounds')
        const handle=await open(join(root,path),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
        let bytes
        try {
          const current=await handle.stat()
          if(!current.isFile()||current.size!==info.size) throw new Error('Source changed')
          const buffer=Buffer.alloc(info.size+1), result=await handle.read(buffer,0,buffer.length,0)
          if(result.bytesRead!==info.size) throw new Error('Source changed')
          bytes=buffer.subarray(0,result.bytesRead)
        } finally {await handle.close()}
        const mode=info.mode&0o111 ? '100755' : '100644', sha=objectHash('blob',bytes)
        tree.push({path,type:'blob',mode,sha,size:bytes.length});children.push({path,type:'blob',mode,sha})
        files.push({path,mode,blobSha:sha,sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length})
        totalBytes+=bytes.length
      } else throw new Error('Source special file is not allowed')
    }
    children.sort((a,b)=>Buffer.compare(Buffer.from(a.path.slice(relative?relative.length+1:0)+(a.type==='tree'?'/':'')),Buffer.from(b.path.slice(relative?relative.length+1:0)+(b.type==='tree'?'/':''))))
    const bytes=Buffer.concat(children.map(e=>Buffer.concat([Buffer.from(e.mode.replace(/^0+/,'')+' '+e.path.slice(relative?relative.length+1:0)+'\0'),Buffer.from(e.sha,'hex')])))
    return objectHash('tree',bytes)
  }
  const treeSha=await visit(''), byPath=(a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path))
  tree.sort(byPath);files.sort(byPath)
  const sourceHash=digest({version:1,repositoryId:scope.repositoryId,sourceSha:scope.sourceSha,treeSha,tree,files,totalBytes})
  if(sourceHash!==scope.sourceHash) throw new Error('Mounted source differs from admission')
  return sourceHash
}
