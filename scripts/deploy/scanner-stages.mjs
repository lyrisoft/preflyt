// Keep bundled stages identical to the standalone native Dockerfiles.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
export const scannerSources = {gitleaks:'gitleaks',semgrep:'semgrep',duplication:'duplication',trivy:'trivy',dependencies:'trivy'}
export function scannerStages(read = path => readFileSync(path, 'utf8')) {
 return Object.entries(scannerSources).map(([name,file]) => {
  const lines=read(`docs/deployment/native-runner/Dockerfile.${file}`).trim().split('\n')
  // The dependencies target ends before the final database-free runtime target.
  if(name==='dependencies'){
   const runtime=lines.findIndex(line=>line==='FROM base AS runtime')
   if(runtime<0)throw new Error('Missing database-free Trivy runtime target')
   lines.splice(runtime)
  }
  const last=lines.findLastIndex(line=>line.startsWith('FROM ')),aliases=new Map()
  return lines.map((line,index)=>{
   if(line.startsWith('FROM ')) {
    const [,source,,alias]=line.split(/\s+/),stage=index===last?`bundle-${name}`:`bundle-${name}-${alias??index}`
    const result=`FROM ${aliases.get(source)??source} AS ${stage}`
    if(alias)aliases.set(alias,stage)
    return result
   }
   if(line.startsWith('COPY --from='))return line.replace(/--from=([^ ]+)/,(_,alias)=>`--from=${aliases.get(alias)??alias}`)
   if(line.startsWith('COPY '))return line.replace(/^COPY (.+) (\S+)$/,(_,sources,destination)=>`COPY ${sources.split(' ').map(source=>'docs/deployment/native-runner/'+source).join(' ')} ${destination}`)
   return line
  }).join('\n')
 }).join('\n\n')+'\n'
}
export const begin='# BEGIN GENERATED SCANNER STAGES',end='# END GENERATED SCANNER STAGES'
export function updateScannerStages(source,stages=scannerStages()) {
 const start=source.indexOf(begin),finish=source.indexOf(end)
 if(start<0||finish<start+begin.length||start!==source.lastIndexOf(begin)||finish!==source.lastIndexOf(end))throw new Error('Scanner stage markers missing, duplicated or out of order')
 return source.slice(0,start)+begin+'\n'+stages+end+source.slice(finish+end.length)
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const file='deploy/api.Dockerfile',source=readFileSync(file,'utf8')
 writeFileSync(file,updateScannerStages(source))
}
