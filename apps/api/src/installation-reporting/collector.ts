import {createServer,type IncomingMessage,type ServerResponse} from 'node:http'
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto'
import type {Pool} from 'pg'
import {reportCountry,type CountryLookup} from './country.js'
import {validReport} from './reporting-policy.js'
export async function initializeCollector(pool:Pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS preflyt_installations (
 installation_id UUID PRIMARY KEY, version VARCHAR(80) NOT NULL, deployment_type VARCHAR(20) NOT NULL,
 first_seen TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen TIMESTAMPTZ NOT NULL DEFAULT now())`)
 await pool.query('ALTER TABLE preflyt_installations ADD COLUMN IF NOT EXISTS country_code VARCHAR(2)')
 await pool.query('CREATE INDEX IF NOT EXISTS preflyt_installations_last_seen ON preflyt_installations(last_seen)')
}
export async function pruneCollector(pool:Pool){await pool.query("DELETE FROM preflyt_installations WHERE last_seen < now() - interval '90 days'")}
function body(req:IncomingMessage):Promise<unknown>{
 return new Promise((resolve,reject)=>{
  const chunks:Buffer[]=[];let size=0,failed=false
  req.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>2048){if(!failed){failed=true;reject(new Error('size'))}return}if(!failed)chunks.push(chunk)})
  req.on('end',()=>{if(!failed){try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{reject(new Error('json'))}}})
  req.on('error',()=>reject(new Error('request')))
 })
}
export function createInstallationCollector(pool:Pool,adminToken:string,limit=6000,location:{lookup?:CountryLookup;trustedProxies?:Set<string>}={}){
 if(adminToken.length<32)throw new Error('Collector administrator token must contain at least 32 characters')
 const adminHash=createHash('sha256').update('Bearer '+adminToken).digest(),salt=randomBytes(32)
 const requests=new Map<string,{at:number;count:number}>()
 const send=(res:ServerResponse,status:number,data:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))}
 const server=createServer((req,res)=>{void(async()=>{
  if(req.url==='/healthz'&&req.method==='GET'){await pool.query('SELECT 1');send(res,200,{status:'ready'});return}
  if(req.url==='/v1/statistics'&&req.method==='GET'){
   const supplied=createHash('sha256').update(req.headers.authorization??'').digest()
   if(!timingSafeEqual(adminHash,supplied)){send(res,401,{error:'Authentication required'});return}
   const totals=await pool.query(`SELECT count(*)::int AS "knownInstallations", count(*) FILTER (WHERE last_seen >= now()-interval '30 days')::int AS "active30Days",
    count(*) FILTER (WHERE first_seen >= now()-interval '30 days')::int AS "firstSeenLast30Days" FROM preflyt_installations WHERE deployment_type <> 'development' AND version <> 'development'`)
   const versions=await pool.query(`SELECT version,count(*)::int AS installations FROM preflyt_installations WHERE deployment_type <> 'development' AND version <> 'development' AND last_seen>=now()-interval '30 days' GROUP BY version ORDER BY installations DESC LIMIT 100`)
   const types=await pool.query(`SELECT deployment_type AS "deploymentType",count(*)::int AS installations FROM preflyt_installations WHERE deployment_type <> 'development' AND version <> 'development' AND last_seen>=now()-interval '30 days' GROUP BY deployment_type ORDER BY installations DESC`)
   const countries=await pool.query(`SELECT country_code AS "countryCode",count(*)::int AS installations FROM preflyt_installations WHERE country_code IS NOT NULL AND deployment_type <> 'development' AND version <> 'development' AND last_seen>=now()-interval '30 days' GROUP BY country_code ORDER BY installations DESC,country_code`)
   send(res,200,{byCountry:countries.rows,...totals.rows[0],byVersion:versions.rows,byDeploymentType:types.rows,retentionDays:90,excludesDevelopment:true});return
  }
  if(req.url!=='/v1/installations'||req.method!=='POST'){send(res,404,{error:'Not found'});return}
  const now=Date.now(),peer=createHash('sha256').update(salt).update(req.socket.remoteAddress??'unknown').digest('hex')
  for(const [key,value]of requests)if(now-value.at>=60000)requests.delete(key)
  if(!requests.has(peer)&&requests.size>=10000){send(res,429,{error:'Try later'});return}
  const counter=requests.get(peer)??{at:now,count:0};counter.count++;requests.set(peer,counter)
  if(counter.count>limit){send(res,429,{error:'Try later'});return}
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??'')){send(res,415,{error:'JSON required'});return}
  if(Number(req.headers['content-length']??0)>2048){req.resume();send(res,413,{error:'Report too large'});return}
  let report:unknown
  try{report=await body(req)}catch{send(res,400,{error:'Invalid report'});return}
  if(!validReport(report)){send(res,422,{error:'Unsupported report fields'});return}
  const country=report.countryReporting===true?reportCountry(req,location.lookup,location.trustedProxies??new Set()):null
  await pool.query(`INSERT INTO preflyt_installations(installation_id,version,deployment_type,country_code) VALUES($1,$2,$3,$4)
   ON CONFLICT(installation_id) DO UPDATE SET version=EXCLUDED.version,deployment_type=EXCLUDED.deployment_type,country_code=EXCLUDED.country_code,last_seen=now()
   WHERE preflyt_installations.last_seen <= now()-interval '1 hour' OR ($5 = false AND preflyt_installations.country_code IS NOT NULL)`,[report.installationId,report.version,report.deploymentType,country,report.countryReporting===true])
  send(res,202,{accepted:true})
 })().catch(()=>{if(!res.headersSent)send(res,503,{error:'Collector temporarily unavailable'});else res.end()})})
 server.requestTimeout=10000;server.headersTimeout=10000;server.maxHeadersCount=30
 return server
}
