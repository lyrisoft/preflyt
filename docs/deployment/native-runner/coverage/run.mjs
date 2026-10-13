// Image-owned parent uses Node runner events; repository code runs only in child processes.
import {run} from 'node:test'
import {globSync,lstatSync,readFileSync} from 'node:fs'
import {writeFile} from 'node:fs/promises'
import {resolve,relative} from 'node:path'
const root='/workspace'
let unavailable='TEST_RUNNER_FAILED'
try {
 const files=globSync('**/*.{js,mjs,cjs}',{cwd:root,exclude:['**/node_modules/**','**/.git/**','**/dist/**','**/build/**','**/coverage/**','**/vendor/**']})
  .filter(path=>/(?:^|\/)(?:[^/]+\.test|test-[^/]+)\.(?:js|mjs|cjs)$/.test(path))
  .map(path=>resolve(root,path)).filter(path=>lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink()).sort()
 if(!files.length||files.length>100) {unavailable=files.length?'TEST_SCOPE_LIMIT':'NO_TESTS_EXECUTED';throw new Error('No bounded supported test scope')}
 // Confirm the recipe against the complete verified checkout, even when
 // manifest/profile inspection did not read test file contents.
 const configFiles=globSync('**/{package.json,vitest.config.*,jest.config.*}',{cwd:root,exclude:['**/node_modules/**','**/.git/**','**/dist/**','**/build/**','**/coverage/**','**/vendor/**']})
 unavailable='SUPPORTED_TESTS_REQUIRED'
 for(const path of configFiles) {
  if(!path.endsWith('package.json')) throw new Error('Unsupported framework')
  const manifest=JSON.parse(readFileSync(resolve(root,path),'utf8'))
  const dependencies={...manifest.dependencies,...manifest.devDependencies,...manifest.optionalDependencies}
  if(Object.keys(dependencies).some(name=>/^(?:vitest|jest|@jest\/|@vitest\/)/.test(name))) throw new Error('Unsupported framework')
  if(Object.values(manifest.scripts??{}).some(command=>typeof command==='string'&&/(?:^|[\s;&|])(?:vitest|jest)(?:[\s;&|]|$)/.test(command))) throw new Error('Unsupported framework')
 }
 for(const path of files) {
  const text=readFileSync(path,'utf8')
  if(!/(?:from\s*|require\s*\(\s*|import\s*\(\s*)['"]node:test['"]/.test(text)) throw new Error('Unsupported test recipe')
 }
 unavailable='TEST_RUNNER_FAILED'
 const stream=run({files,isolation:'process',concurrency:1,timeout:250000,coverage:true,coverageIncludeGlobs:['/workspace/**'],coverageExcludeGlobs:['**/node_modules/**','**/*.test.*','**/test-*.*','**/dist/**','**/build/**','**/coverage/**','**/vendor/**']})
 let summary=null,coverage=null
 for await(const event of stream) {
  if(event.type==='test:summary'&&event.data.file===undefined) summary=event.data
  if(event.type==='test:coverage') coverage=event.data.summary
 }
 if(!summary?.counts?.tests) {unavailable='NO_TESTS_EXECUTED';throw new Error('No tests')}
 if(!summary.success||summary.counts.failed||summary.counts.cancelled||summary.counts.skipped||summary.counts.todo) {unavailable=summary.counts.failed?'TESTS_FAILED':summary.counts.cancelled?'TESTS_CANCELLED':summary.counts.skipped||summary.counts.todo?'TESTS_SKIPPED':'TEST_RUNNER_FAILED';throw new Error('Actual complete tests required')}
 let analyzedLines=0,coveredLines=0,analyzedFiles=0
 for(const file of coverage?.files??[]) {
  const path=relative(root,file.path)
  if(!path||path.startsWith('/')||path.split('/').some(p=>['..','.',''].includes(p))) throw new Error('Invalid coverage location')
  if(!Number.isSafeInteger(file.totalLineCount)||!Number.isSafeInteger(file.coveredLineCount)||file.totalLineCount<1||file.coveredLineCount<0||file.coveredLineCount>file.totalLineCount) throw new Error('Invalid measured lines')
  analyzedLines+=file.totalLineCount;coveredLines+=file.coveredLineCount;analyzedFiles++
 }
 if(!analyzedLines||analyzedLines>50000000||!analyzedFiles) {unavailable='NO_SOURCE_COVERAGE';throw new Error('No measured source coverage')}
 const measurement={version:1,kind:'coverage',formula:'node-covered-lines-v1',scope:'node-loaded-files',analyzedLines,coveredLines,analyzedFiles,tests:summary.counts.tests,passed:summary.counts.passed,failed:0,skipped:0,cancelled:0,todo:0}
 if(measurement.tests!==measurement.passed) throw new Error('Incomplete test count')
 // No test messages, source, names, logs, or credentials enter the signed report.
 const report=JSON.stringify({version:'2.1.0',runs:[{tool:{driver:{name:'Preflyt test coverage',version:process.versions.node}},properties:{preflytMeasurement:measurement},results:[]}]})
 await writeFile('/reports/report.sarif',report,{flag:'wx'})
 process.exitCode=0
} catch {
 try {await writeFile('/reports/report.sarif',JSON.stringify({version:'2.1.0',runs:[{tool:{driver:{name:'Preflyt test coverage',version:process.versions.node}},properties:{preflytCoverageUnavailable:unavailable},results:[]}]}),{flag:'wx'})}catch{}
 process.exitCode=2
}
