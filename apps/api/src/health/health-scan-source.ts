import { digest } from '../assessments/assessment-digest.js'
import { gitObjectHash, safeSourcePath, sourceLimits, validateSourceBlob, verifyNativeSourceBundle, type GitSourceEntry, type NativeSourceFile } from '../execution/native-source.js'

const order = (a: {path:string}, b: {path:string}) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))
/** Hash a complete Git tree without extracting archives, following links or trusting provider path locations. */
function treeHash(entries: Array<{path:string;type:string;mode:string;sha:string}>, root: string) {
  const dirs = new Map<string, typeof entries>([['',[]]])
  for (const entry of entries) if (entry.type === 'tree') dirs.set(entry.path, [])
  for (const entry of entries) {
    const index=entry.path.lastIndexOf('/'), parent=index<0?'':entry.path.slice(0,index)
    const children=dirs.get(parent); if (!children) throw new Error('Incomplete Git tree')
    children.push(entry)
  }
  for (const [path,children] of [...dirs].sort(([a],[b])=>b.split('/').length-a.split('/').length)) {
    const name=(entry:typeof entries[number])=>entry.path.slice(path?path.length+1:0)
    children.sort((a,b)=>Buffer.compare(Buffer.from(name(a)+(a.type==='tree'?'/':'')),Buffer.from(name(b)+(b.type==='tree'?'/':''))))
    const hash=gitObjectHash('tree',Buffer.concat(children.map(entry=>Buffer.concat([Buffer.from(entry.mode.replace(/^0+/,'')+' '+name(entry)+'\0'),Buffer.from(entry.sha,'hex')]))))
    const entry=entries.find(entry=>entry.path===path)
    if (hash !== (path?entry?.sha:root)) throw new Error('Git tree contents changed')
  }
}

export async function readHealthScanSource(request: <T>(path:string)=>Promise<T>, base:string, repositoryId:string, sourceSha:string, signal?:AbortSignal, readBlobs?: (entries: GitSourceEntry[]) => Promise<Map<string, unknown>>) {
  signal?.throwIfAborted()
  if (!/^[a-f0-9]{40}$/.test(sourceSha) || !/^[1-9]\d{0,15}$/.test(repositoryId) || !/^\/repos\/[a-zA-Z0-9_.%-]+\/[a-zA-Z0-9_.%-]+$/.test(base)) throw new Error('Invalid health source scope')
  const commit=await request<{sha:string;tree:{sha:string}}>(`${base}/git/commits/${sourceSha}`)
  if (commit.sha!==sourceSha || !/^[a-f0-9]{40}$/.test(commit.tree?.sha)) throw new Error('Commit changed')
  const raw=await request<{sha:string;truncated:boolean;tree:Array<{path:string;type:string;mode:string;sha:string;size?:number}>}>(`${base}/git/trees/${commit.tree.sha}?recursive=1`)
  if (raw.sha!==commit.tree.sha || raw.truncated || !Array.isArray(raw.tree) || raw.tree.length>20000) throw new Error('Repository tree exceeds safe inventory bounds')
  const seen=new Set<string>()
  for (const entry of raw.tree) {
    if (!safeSourcePath(entry.path) || seen.has(entry.path.toLowerCase()) || !/^[a-f0-9]{40}$/.test(entry.sha) ||
      !((entry.type==='tree'&&entry.mode==='040000') || (entry.type==='blob'&&['100644','100755','120000'].includes(entry.mode)) || (entry.type==='commit'&&entry.mode==='160000')))
      throw new Error('Unsafe source tree')
    seen.add(entry.path.toLowerCase())
  }
  treeHash(raw.tree,commit.tree.sha)
  const selected=raw.tree.filter(entry=>entry.type==='blob' && ['100644','100755'].includes(entry.mode) &&
    Number.isSafeInteger(entry.size) && entry.size!>=0 && entry.size!<=sourceLimits.fileBytes &&
    !/(?:^|\/)(?:node_modules|vendor|dist|build|coverage|\.git)\//.test(entry.path) &&
    !/\.(?:png|jpe?g|gif|webp|ico|pdf|mp[34]|mov|woff2?|ttf|zip|gz|tgz|jar|bin|exe|so|dylib)$/i.test(entry.path)) as GitSourceEntry[]
  if (selected.length>sourceLimits.files || selected.reduce((n,f)=>n+(f.size??0),0)>sourceLimits.totalBytes) throw new Error('Repository scan exceeds safe source bounds')
  const files:NativeSourceFile[]=[]
  if (readBlobs) {
    // Batches preserve the same Git blob proof; provider text is never trusted without hashing.
    const blobs = await readBlobs(selected)
    for (const entry of selected) files.push(validateSourceBlob(blobs.get(entry.sha),entry))
  } else {
    let cursor=0, failed=false
    const readers = await Promise.allSettled(Array.from({length:Math.min(4,selected.length)},async()=>{
      try { while (!failed && cursor<selected.length) { signal?.throwIfAborted(); const entry=selected[cursor++]; files.push(validateSourceBlob(await request(`${base}/git/blobs/${entry.sha}`),entry)) } }
      catch(error) { failed=true; throw error }
    }))
    const failure = readers.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
  }
  signal?.throwIfAborted(); files.sort(order)
  const tree:GitSourceEntry[]=files.map(file=>({path:file.path,type:'blob',mode:file.mode,sha:file.blobSha,size:file.size}))
  const dirs=new Set<string>()
  for (const file of files) { const parts=file.path.split('/'); for(let i=1;i<parts.length;i++) dirs.add(parts.slice(0,i).join('/')) }
  let root=''
  for (const path of [...dirs,''].sort((a,b)=>b.split('/').length-a.split('/').length || b.length-a.length)) {
    const children=tree.filter(entry=>{const index=entry.path.lastIndexOf('/');return (index<0?'':entry.path.slice(0,index))===path})
    const name=(entry:GitSourceEntry)=>entry.path.slice(path?path.length+1:0)
    children.sort((a,b)=>Buffer.compare(Buffer.from(name(a)+(a.type==='tree'?'/':'')),Buffer.from(name(b)+(b.type==='tree'?'/':''))))
    const sha=gitObjectHash('tree',Buffer.concat(children.map(entry=>Buffer.concat([Buffer.from(entry.mode.replace(/^0+/,'')+' '+name(entry)+'\0'),Buffer.from(entry.sha,'hex')]))))
    if(path)tree.push({path,type:'tree',mode:'040000',sha});else root=sha
  }
  tree.sort(order)
  const manifest={version:1 as const,repositoryId,sourceSha,treeSha:root,tree,files:files.map(({content,...file})=>file),totalBytes:files.reduce((n,f)=>n+f.size,0)}
  const source=verifyNativeSourceBundle({...manifest,files,sourceHash:digest(manifest)})
  return {source, originalTreeSha:commit.tree.sha, excludedFiles:raw.tree.filter(entry=>entry.type!=='tree').length-files.length}
}
