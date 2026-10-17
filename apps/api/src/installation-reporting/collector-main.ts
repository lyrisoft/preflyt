import 'dotenv/config'
import {loadCountryLookup,trustedProxies} from './country.js'
import {Pool} from 'pg'
import {createInstallationCollector,initializeCollector,pruneCollector} from './collector.js'
const token=process.env.PREFLYT_INSTALLATION_COLLECTOR_ADMIN_TOKEN
if(!token||token.length<32)throw new Error('Set a collector administrator token of at least 32 characters')
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:5000,statement_timeout:5000})
await initializeCollector(pool);await pruneCollector(pool)
const countryPath=process.env.PREFLYT_INSTALLATION_COLLECTOR_COUNTRY_DATABASE
const lookup=countryPath?await loadCountryLookup(countryPath):undefined
const server=createInstallationCollector(pool,token,6000,{lookup,trustedProxies:trustedProxies(process.env.PREFLYT_INSTALLATION_COLLECTOR_TRUSTED_PROXIES)})
const timer=setInterval(()=>{void pruneCollector(pool).catch(()=>{})},60*60*1000);timer.unref()
server.listen(Number(process.env.PREFLYT_INSTALLATION_COLLECTOR_PORT??3020),process.env.PREFLYT_INSTALLATION_COLLECTOR_HOST??'127.0.0.1')
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{clearInterval(timer);server.close(()=>{void pool.end()})})
