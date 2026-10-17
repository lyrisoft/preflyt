import {readFile} from 'node:fs/promises'
import {BlockList,isIP} from 'node:net'
import type {IncomingMessage} from 'node:http'
import {Reader,type CountryResponse} from 'mmdb-lib'

export type CountryLookup=(address:string)=>string|null
const countries=new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' '))
export function countryCode(value:unknown):string|null{return typeof value==='string'&&countries.has(value)?value:null}
const normalize=(address:string)=>address.startsWith('::ffff:')&&isIP(address.slice(7))===4?address.slice(7):address
const privateNetworks=new BlockList()
for(const [address,prefix]of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['192.0.2.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)privateNetworks.addSubnet(address,prefix,'ipv4')
// Only global unicast IPv6 can be looked up; reject local, multicast and documentation ranges.
privateNetworks.addSubnet('2001:db8::',32,'ipv6')
export function publicAddress(address:string):string|null{
 const ip=normalize(address),family=isIP(ip)
 if(family===4)return privateNetworks.check(ip,'ipv4')?null:ip
 if(family===6){const global=new BlockList();global.addSubnet('2000::',3,'ipv6');return global.check(ip,'ipv6')&&!privateNetworks.check(ip,'ipv6')?ip:null}
 return null
}
export function trustedProxies(value=''):Set<string>{
 const entries=value.split(',').map(value=>value.trim()).filter(Boolean)
 if(entries.some(value=>!isIP(value)))throw new Error('Collector trusted proxies must be exact IP addresses')
 return new Set(entries.map(normalize))
}
export function reportCountry(req:IncomingMessage,lookup:CountryLookup|undefined,trusted:Set<string>):string|null{
 if(!lookup)return null
 const peer=normalize(req.socket.remoteAddress??'')
 // The immediate proxy must overwrite X-Real-IP. Never trust arbitrary forwarded headers or chains.
 const header=trusted.has(peer)?req.headers['x-real-ip']:undefined
 const address=publicAddress(typeof header==='string'?header:peer)
 if(!address)return null
 try{return countryCode(lookup(address))}catch{return null}
}
export async function loadCountryLookup(path:string):Promise<CountryLookup>{
 const reader=new Reader<CountryResponse>(await readFile(path))
 if(!/Country/.test(reader.metadata.databaseType))throw new Error('Configure a Country MMDB database')
 // No address/result cache and no network requests. Only retain the static database in memory.
 return address=>countryCode(reader.get(address)?.country?.iso_code)
}
