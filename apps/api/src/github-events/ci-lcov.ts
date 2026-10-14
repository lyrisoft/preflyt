/** Bounded LCOV line counters. No source, URLs or test code is executed or fetched. */
export function ciLcov(content: string) {
 const files=new Map<string,Map<number,boolean>>()
 let current:{path:string;lines:Map<number,boolean>;found?:number;hit?:number}|undefined
 for(const line of content.split(/\r?\n/)) {
  if(line.startsWith('SF:')) {
   const path=line.slice(3)
   if(current||!path||path.length>1024||/[\x00-\x1f\\]/.test(path)||path.split('/').includes('..'))throw Error('Invalid LCOV path')
   current={path,lines:new Map()}
  } else if(line.startsWith('DA:')) {
   const match=/^DA:(\d+),(\d+)(?:,[^,\r\n]+)?$/.exec(line)
   if(!current||!match)throw Error('Invalid LCOV line')
   const number=Number(match[1]),count=Number(match[2])
   if(!Number.isSafeInteger(number)||number<1||number>50000000||!Number.isSafeInteger(count)||count<0||current.lines.has(number))throw Error('Invalid LCOV counter')
   current.lines.set(number,count>0)
  } else if(/^L[HF]:/.test(line)) {
   const match=/^L([HF]):(\d+)$/.exec(line)
   if(!current||!match)throw Error('Invalid LCOV total')
   const key=match[1]==='F'?'found':'hit'
   if(current[key]!==undefined)throw Error('Duplicate LCOV total')
   current[key]=Number(match[2])
  } else if(line==='end_of_record') {
   if(!current||!current.lines.size||current.found!==current.lines.size||current.hit!==[...current.lines.values()].filter(Boolean).length)throw Error('LCOV totals do not match measured lines')
   const merged=files.get(current.path)??new Map<number,boolean>()
   for(const [number,hit] of current.lines)merged.set(number,!!merged.get(number)||hit)
   files.set(current.path,merged);current=undefined
  } else if(line && !/^(?:TN:|FN:|FNDA:|FNF:|FNH:|BRDA:|BRF:|BRH:|VER:)/.test(line))throw Error('Unsupported LCOV record')
 }
 if(current||!files.size||files.size>10000)throw Error('Incomplete LCOV report')
 const analyzedLines=[...files.values()].reduce((n,lines)=>n+lines.size,0),coveredLines=[...files.values()].reduce((n,lines)=>n+[...lines.values()].filter(Boolean).length,0)
 if(analyzedLines>50000000)throw Error('LCOV scope exceeds limits')
 return {version:1 as const,formula:'lcov-reported-lines-v1' as const,scope:'ci-reported-files' as const,analyzedFiles:files.size,analyzedLines,coveredLines}
}
