// jscpd 4.3.0 consumes only source identity, token ranges and boundary locations.
// Keep those fields in bounded numeric slabs, rather than retaining every token's
// source substring and object graph for the lifetime of the scan.
export class CompactCloneStore {
 constructor(maxFrames = 4000000) {
  this.maxFrames=maxFrames; this.count=0; this.spaces=new Map(); this.sources=[]; this.sourceIds=new Map(); this.slabs=[]
 }
 namespace(name) {
  this.previous=null
  if(!this.spaces.has(name))this.spaces.set(name,new Map())
  this.active=this.spaces.get(name)
 }
 async get(key) {
  const index=this.active.get(key)
  if(index===undefined){this.previous=null;throw new Error('not found')}
  const slab=this.slabs[Math.floor(index/16384)],offset=(index%16384)*9
  const v=slab.subarray(offset,offset+9)
  // jscpd can otherwise stitch hash hits from unrelated sources or backwards
  // ranges into one clone. A run must advance through overlapping windows in
  // the same source; a discontinuity ends the candidate through a normal miss.
  const prior=this.previous
  if(prior && (v[0]!==prior[0] || v[3]<=prior[3] || v[7]<=prior[7] || v[3]>prior[7])){
   this.previous=null;throw new Error('non-contiguous clone')
  }
  this.previous=v
  return {sourceId:this.sources[v[0]],start:{loc:{start:{line:v[1],column:v[2],position:v[3]}},range:[v[4],v[4]]},end:{loc:{end:{line:v[5],column:v[6],position:v[7]}},range:[v[8],v[8]]}}
 }
 async set(key,value) {
  if(this.count>=this.maxFrames)throw new Error('Duplication token limit reached')
  if(!this.sourceIds.has(value.sourceId)){this.sourceIds.set(value.sourceId,this.sources.length);this.sources.push(value.sourceId)}
  const values=[this.sourceIds.get(value.sourceId),value.start.loc.start.line,value.start.loc.start.column,value.start.loc.start.position,value.start.range[0],value.end.loc.end.line,value.end.loc.end.column,value.end.loc.end.position,value.end.range[1]]
  if(values.some(v=>!Number.isSafeInteger(v)||v<0||v>0xffffffff))throw new Error('Invalid clone location')
  const index=this.count++,slabIndex=Math.floor(index/16384)
  if(!this.slabs[slabIndex])this.slabs[slabIndex]=new Uint32Array(16384*9)
  this.slabs[slabIndex].set(values,(index%16384)*9);this.active.set(key,index)
  return value
 }
 close(){this.previous=null;this.active=new Map();this.spaces.clear();this.sources=[];this.sourceIds.clear();this.slabs=[];this.count=0}
}
