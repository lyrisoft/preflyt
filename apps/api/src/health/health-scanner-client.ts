import { Injectable } from '@nestjs/common'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { request as httpsRequest } from 'node:https'
import { healthScannerAuthority, type HealthScannerPackage } from './health-scanner-package.js'
import { verifyNativeReceipt, type NativeReceiptExpected } from '../execution/native-receipt.js'
import type { NativeSourceBundle } from '../execution/native-source.js'

type Connection = { origin: string; apiKey: string; publicKey: string; ca: string }
export const healthConnectionFile = () => process.env.HEALTH_SCANNER_CONNECTION_FILE ??
  resolve(dirname(fileURLToPath(import.meta.url)), '../../.preflyt/health-scanner/connection.json')

/** The application gets HTTP credentials only, never Docker/cluster authority or the scanner private signing key. */
@Injectable()
export class HealthScannerClient {
  private async connection(): Promise<Connection> {
    const file = await open(healthConnectionFile(), constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const stat = await file.stat()
      if (!stat.isFile() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid()) || stat.size > 12000)
        throw new Error('Scanner connection is not protected')
      const value = JSON.parse(await file.readFile('utf8')) as Connection
      const url = new URL(value.origin)
      if (url.origin !== value.origin || url.username || url.password ||
        url.protocol !== 'https:' || typeof value.ca !== 'string' || !value.ca.startsWith('-----BEGIN CERTIFICATE-----') ||
        typeof value.apiKey !== 'string' || value.apiKey.length < 32 || value.apiKey.length > 256 || typeof value.publicKey !== 'string')
        throw new Error('Invalid scanner connection')
      return value
    } finally { await file.close() }
  }
  private async request(path: string, body?: unknown) {
    const connection = await this.connection()
    const value = await new Promise<any>((resolve, reject) => {
      const req=httpsRequest(connection.origin+path,{method:body===undefined?'GET':'POST',ca:connection.ca,rejectUnauthorized:true,
        headers:{Authorization:'Bearer '+connection.apiKey,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000)},res=>{
        if(res.statusCode!==200){res.resume();reject(new Error('Health scanner is temporarily unavailable'));return}
        let bytes=0;const chunks:Buffer[]=[]
        res.on('data',chunk=>{bytes+=chunk.length;if(bytes>65536){res.destroy();reject(new Error('Invalid scanner response'))}else chunks.push(chunk)})
        res.on('error',reject);res.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString()))}catch{reject(new Error('Invalid scanner response'))}})
      })
      req.on('error',()=>reject(new Error('Health scanner connection could not be verified')))
      req.end(body===undefined?undefined:JSON.stringify(body))
    })
    return { connection, value }
  }
  async package(organizationId: string): Promise<HealthScannerPackage> {
    const { connection, value } = await this.request('/package')
    if (value.controllerPublicKey !== connection.publicKey) throw new Error('Scanner identity changed')
    healthScannerAuthority(value, organizationId)
    return value
  }
  async call(action: 'admit' | 'status' | 'cancel', expected: NativeReceiptExpected, source?: NativeSourceBundle) {
    const { value } = await this.request('/jobs/' + action, { expected, ...(source ? { source } : {}) })
    if (!value || !['PREPARING','RUNNING','COMPLETE','NOT_FOUND'].includes(value.state)) throw new Error('Invalid scanner state')
    return value as { state: string; signature?: string; cleanupConfirmed?: boolean }
  }
  verify(pkg: HealthScannerPackage, expected: NativeReceiptExpected, signature: unknown) {
    return verifyNativeReceipt(signature, expected, Date.now(), healthScannerAuthority(pkg, expected.organizationId))
  }
}
