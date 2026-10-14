import { createServer } from 'node:http'
import { createServer as createSecureServer } from 'node:https'
import { createHash, timingSafeEqual } from 'node:crypto'
import { NativeControllerJobs } from '../execution/native-controller-jobs.js'
import { dockerCommand, runIsolatedDockerCheck, type DockerCommand } from '../execution/native-docker-job.js'
import { admitHealthScan, healthDockerControls, type HealthScannerPackage } from './health-scanner-package.js'

/** Scanner host only. Fixed commands, isolated containers, signed scoped results and durable cleanup reuse the tested job engine. */
export async function healthScannerServer(pkg: HealthScannerPackage, apiKey: string, directory: string, command: DockerCommand = dockerCommand, tls?: { key: string; cert: string }) {
  if (apiKey.length < 32 || apiKey.length > 256) throw new Error('Invalid scanner credential')
  const verify = async () => {
    const current = healthDockerControls(JSON.parse((await command(['info','--format','{{json .}}'])).toString()), pkg.runtime)
    if (current !== pkg.controlsHash) throw new Error('Scanner isolation changed')
  }
  await verify()
  const jobs = new NativeControllerJobs(directory, (scope, ruleId, path, signal, _source, plan) => {
    const tool = pkg.tools.find(t => t.ruleId === ruleId)
    if (!tool) throw new Error('Scanner image unavailable')
    return runIsolatedDockerCheck(scope, ruleId, tool, path, { runtime: pkg.runtime, approvalHash: pkg.controlsHash,
      environmentId: pkg.environmentId, verify, policy: 'health' }, signal, command)
  }, undefined, 'docker', expected => admitHealthScan(pkg, expected))
  await jobs.initialize()
  await jobs.pruneHealthJournals()
  const hash = (value: string) => createHash('sha256').update(value).digest()
  const listener: import('node:http').RequestListener = async (req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store' }); res.end(JSON.stringify(body))
    }
    if (!timingSafeEqual(hash(req.headers.authorization ?? ''), hash('Bearer ' + apiKey))) { reply(401, { message:'Scanner authentication required' }); return }
    if (req.method === 'GET' && req.url === '/package') {
      try { await verify(); if (!jobs.available) throw new Error(); reply(200, pkg) }
      catch { reply(503, { message:'Scanner temporarily unavailable' }) }
      return
    }
    const action = /^\/jobs\/(admit|status|cancel)$/.exec(req.url ?? '')?.[1] as 'admit'|'status'|'cancel'|undefined
    if (req.method !== 'POST' || !action) { reply(404, { message:'Unavailable' }); return }
    try {
      let bytes = 0; const chunks: Buffer[] = []
      for await (const chunk of req) {
        bytes += chunk.length; if (bytes > (action === 'admit' ? 128 * 1024 * 1024 : 65536)) throw new Error('Input exceeds bounds')
        chunks.push(Buffer.from(chunk))
      }
      const input = JSON.parse(Buffer.concat(chunks).toString())
      if (Object.keys(input).sort().join(',') !== (action === 'admit' ? 'expected,source' : 'expected')) throw new Error('Invalid request')
      if (action==='admit') admitHealthScan(pkg, input.expected)
      else if (!/^health:[a-f0-9-]{36}$/.test(input.expected?.selectionId) || input.expected.selectionId!=='health:'+input.expected.requestId) throw new Error('Invalid health scope')
      try { reply(200, await jobs.call(action, input.expected, input.source)) }
      catch (error) {
        if (action!=='admit' && (error as any).code==='ENOENT')
          reply(200, jobs.idle ? action==='cancel'?{state:'COMPLETE',cleanupConfirmed:true}:{state:'NOT_FOUND'} : {state:'PREPARING'})
        else throw error
      }
    } catch { reply(409, { message:'Scanner request could not be completed' }) }
  }
  const server = tls ? createSecureServer(tls, listener) : createServer(listener)
  server.requestTimeout = 30000; server.headersTimeout = 10000; server.maxHeadersCount = 32; server.timeout = 30000
  return { server, idle: () => jobs.idle, maintain: () => jobs.pruneHealthJournals(), close: async () => { server.close(); server.closeAllConnections(); await jobs.close() } }
}
