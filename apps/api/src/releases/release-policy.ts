export type ReleaseNote = {tag:string; name:string; body:string; url:string; publishedAt:string; prerelease:boolean; ready:boolean}
export function versionParts(value:string) {
 const m=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/.exec(value)
 if(m?.[4] && m[4].split('.').some(part=>!part || !/^[0-9A-Za-z-]+$/.test(part) || /^0[0-9]+$/.test(part)))return null
 return m ? {numbers:m.slice(1,4).map(BigInt),pre:m[4]??''} : null
}
export function compareVersions(a:string,b:string):number {
 const x=versionParts(a),y=versionParts(b); if(!x||!y) return 0
 for(let i=0;i<3;i++) if(x.numbers[i]!==y.numbers[i]) return x.numbers[i]>y.numbers[i]?1:-1
 if(x.pre===y.pre)return 0
 if(!x.pre||!y.pre)return x.pre?-1:1
 const xx=x.pre.split('.'),yy=y.pre.split('.')
 for(let i=0;i<Math.max(xx.length,yy.length);i++) {
  if(xx[i]===yy[i])continue
  if(xx[i]===undefined||yy[i]===undefined)return xx[i]===undefined?-1:1
  const xn=/^\d+$/.test(xx[i]),yn=/^\d+$/.test(yy[i])
  if(xn&&yn)return BigInt(xx[i])>BigInt(yy[i])?1:-1
  if(xn!==yn)return xn?-1:1
  return xx[i]>yy[i]?1:-1
 }
 return 0
}
export function parseReleases(raw:unknown):ReleaseNote[] {
 if(!Array.isArray(raw))throw new Error('Invalid release response')
 return raw.slice(0,30).flatMap(r=>{
  if(!r || r.draft || typeof r.tag_name!=='string' || !versionParts(r.tag_name) ||
    typeof r.html_url!=='string' || r.html_url!==`https://github.com/lyrisoft/preflyt/releases/tag/${r.tag_name}` ||
    typeof r.published_at!=='string' || !Number.isFinite(Date.parse(r.published_at))) return []
  const body=typeof r.body==='string'?r.body.slice(0,60000):''
  const ready=/<!-- preflyt-release-ready:v1 sha=[a-f0-9]{40} -->/.test(body)
  return [{tag:r.tag_name,name:String(r.name??r.tag_name).slice(0,200),body:body.replace(/<!--[^]*?-->/g,''),url:r.html_url,publishedAt:r.published_at,prerelease:!!r.prerelease||!!versionParts(r.tag_name)?.pre,ready}]
 }).sort((a,b)=>compareVersions(b.tag,a.tag))
}
