// Run with the pinned scanner image; compares the original and compact stores.
import {createRequire} from 'node:module'
import {CompactCloneStore} from './compact-store.mjs'
const require=createRequire(import.meta.url)
const {Detector,MemoryStore,weak}=require('@jscpd/core'),{Tokenizer}=require('@jscpd/tokenizer')
const text=Array.from({length:90},(_,i)=>`const example${i} = input${i} + ${i};`).join('\n')
async function scan(store){const detector=new Detector(new Tokenizer(),store,[],{minTokens:50,minLines:5,maxLines:1000000,mode:weak});const rows=[];for(const [id,body,format] of [['a.js',text,'javascript'],['b.js',text,'javascript'],['c.js','// intro\n'+text+'\n// tail','javascript'],['d.ts',text,'typescript']])rows.push(...await detector.detect(id,body,format));return rows.map(({foundDate,...row})=>row)}
const normal=await scan(new MemoryStore()),compact=await scan(new CompactCloneStore())
if(!normal.length||JSON.stringify(normal)!==JSON.stringify(compact))throw new Error('Clone parity failed')
console.log(JSON.stringify({identical:true,clones:normal.length}))
