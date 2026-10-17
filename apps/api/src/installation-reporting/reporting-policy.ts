export const deploymentTypes=['compose','kubernetes','linux','development','unknown'] as const
export type InstallationReport={schemaVersion:1;countryReporting?:boolean;installationId:string;version:string;deploymentType:typeof deploymentTypes[number]}
export function validReport(value:unknown):value is InstallationReport {
 if(!value||typeof value!=='object')return false
 const report=value as Record<string,unknown>
 return ['deploymentType,installationId,schemaVersion,version','countryReporting,deploymentType,installationId,schemaVersion,version'].includes(Object.keys(report).sort().join(',')) && (report.countryReporting===undefined||typeof report.countryReporting==='boolean') && report.schemaVersion===1 &&
  typeof report.installationId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(report.installationId)&&
  typeof report.version==='string'&&/^(?:development|v?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[a-zA-Z0-9.-]+)?)$/.test(report.version)&&report.version.length<=80&&
  deploymentTypes.includes(report.deploymentType as InstallationReport['deploymentType'])
}
export function reportEndpoint(env:NodeJS.ProcessEnv=process.env){
 const raw=env.PREFLYT_INSTALLATION_REPORTING_URL
 if(!raw)return null
 try{
  const url=new URL(raw)
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/v1/installations')return null
  if(url.protocol==='https:')return url.toString()
  // HTTP is available only for an explicitly selected, local development receiver.
  if(env.NODE_ENV!=='production'&&env.PREFLYT_INSTALLATION_REPORTING_ALLOW_LOCAL_HTTP==='true'&&url.protocol==='http:'&&['localhost','127.0.0.1','installation-collector'].includes(url.hostname))return url.toString()
 }catch{}
 return null
}
export function reportPayload(installationId:string,env:NodeJS.ProcessEnv=process.env,countryReporting=false):InstallationReport {
 const version=env.PREFLYT_BUILD_VERSION??'development'
 const configured=env.PREFLYT_DEPLOYMENT_TYPE
 const deploymentType=deploymentTypes.includes(configured as InstallationReport['deploymentType'])?configured as InstallationReport['deploymentType']:version==='development'?'development':'unknown'
 return {schemaVersion:1,installationId,version,deploymentType,countryReporting:countryReporting&&env.PREFLYT_INSTALLATION_COUNTRY_REPORTING_ENABLED!=='false'}
}
