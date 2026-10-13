import {CompactCloneStore} from './compact-store.mjs'
// Fixed, image-owned static scanner. Never read repository scanner configuration or run code.
import { createRequire } from 'node:module'
const { detectClonesAndStatistic } = createRequire(import.meta.url)('jscpd')
import { readFile, writeFile } from 'node:fs/promises'
import { relative } from 'node:path'
const workspace = '/workspace'
const pathFor = name => {
 const path = relative(workspace, name).replaceAll('\\', '/')
 if (!path || path.startsWith('/') || path.split('/').some(p => ['', '.', '..'].includes(p)) || /[?#%\x00-\x1f]/.test(path)) throw new Error('Unsafe scanner location')
 return path
}
try {
 const {clones,statistic} = await detectClonesAndStatistic({
  path:[workspace], minLines:5, minTokens:50, maxLines:1000000, maxSize:'1mb',
  mode:'weak', format:['javascript','typescript','python','java','go','ruby','php','csharp','css','scss','sql','rust'],
  ignore:['**/node_modules/**','**/.git/**','**/vendor/**','**/dist/**','**/build/**','**/coverage/**','**/generated/**','**/*.d.ts','**/*.min.js'],
  gitignore:false, noSymlinks:true, silent:true, reporters:[], blame:false, noTips:true,
 }, new CompactCloneStore())
 const sources = [...new Set(Object.values(statistic.formats).flatMap(format => Object.keys(format.sources)))]
 const sourceLines = new Map()
 let analyzedLines=0
 for (const source of sources) {
  pathFor(source)
  const content = await readFile(source, 'utf8')
  const lines = content.length ? content.split('\n').length - (content.endsWith('\n') ? 1 : 0) : 0
  sourceLines.set(source,lines); analyzedLines+=lines
 }
 const intervals=new Map(), locations=new Map(), matches=new Map()
 for (const clone of clones) for (const block of [clone.duplicationA,clone.duplicationB]) {
  const path=pathFor(block.sourceId), startLine=block.start.line, endLine=block.end.line
  if (!sourceLines.has(block.sourceId) || !Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine<1 || endLine<startLine || endLine>sourceLines.get(block.sourceId)) throw new Error('Invalid clone range')
  const list=intervals.get(path)??[]; list.push([startLine,endLine]);intervals.set(path,list)
  locations.set(`${path}:${startLine}:${endLine}`, {artifactLocation:{uri:path},region:{startLine,endLine}})
 }
 for (const clone of clones) {
  const pair=[clone.duplicationA,clone.duplicationB].map(block=>({path:pathFor(block.sourceId),line:block.start.line,endLine:block.end.line}))
  for (const [index,block] of pair.entries()) {
   const key=`${block.path}:${block.line}:${block.endLine}`, other=pair[1-index], otherKey=`${other.path}:${other.line}:${other.endLine}`
   if(key===otherKey) continue
   const related=matches.get(key)??new Map();related.set(otherKey,other);matches.set(key,related)
  }
 }
 let duplicatedLines=0
 for (const ranges of intervals.values()) {
  ranges.sort((a,b)=>a[0]-b[0]); let start=0,end=-1
  for (const [nextStart,nextEnd] of ranges) {
   if (nextStart>end+1) {if(end>=start) duplicatedLines+=end-start+1;start=nextStart;end=nextEnd}
   else end=Math.max(end,nextEnd)
  }
  if(end>=start) duplicatedLines+=end-start+1
 }
 const measurement={version:1,kind:'duplication',formula:'unique-lines-v1',analyzedLines,duplicatedLines,analyzedFiles:sources.length,clonePairs:clones.length,minimumLines:5,minimumTokens:50,mode:'weak'}
 if(duplicatedLines>analyzedLines || analyzedLines>50000000) throw new Error('Invalid measured scope')
 const results=[...locations.values()].map(physicalLocation=>({
  ruleId:'preflyt-duplicate-block-v1',level:'note',
  message:{text:'This code block matches another analyzed block. Review whether extracting shared logic would make future changes easier.'},
  locations:[{physicalLocation}],
  relatedLocations:[...(matches.get(`${physicalLocation.artifactLocation.uri}:${physicalLocation.region.startLine}:${physicalLocation.region.endLine}`)?.values()??[])]
   .sort((a,b)=>a.path.localeCompare(b.path)||a.line-b.line||a.endLine-b.endLine).slice(0,3)
   .map((block,id)=>({id,physicalLocation:{artifactLocation:{uri:block.path},region:{startLine:block.line,endLine:block.endLine}}})),
 }))
 const report=JSON.stringify({version:'2.1.0',runs:[{tool:{driver:{name:'Preflyt duplication',version:'jscpd-4.3.0/unique-lines-v1'}},properties:{preflytMeasurement:measurement},results}]})
 if(Buffer.byteLength(report)>8388608) throw new Error('Report exceeds bound')
 await writeFile('/reports/report.sarif',report,{flag:'wx'})
 process.exitCode=results.length?1:0
} catch (error) {
 const known=['Unsafe scanner location','Invalid clone range','Invalid measured scope','Report exceeds bound']
 const type=known.includes(error?.message)?error.message:'Duplication processing error'
 await writeFile('/reports/report.sarif',JSON.stringify({version:'2.1.0',runs:[{tool:{driver:{name:'Preflyt duplication'}},properties:{preflytScanErrors:[{type,path:null}]},results:[]}]})).catch(()=>{})
 process.exitCode=2
}
