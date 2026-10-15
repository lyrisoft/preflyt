// Trusted image-owned normalization. Only exact workspace paths are accepted.
export function normalizeSemgrepLocations(report) {
  const pathOf = value => {
    if (typeof value !== 'string') throw new Error('Missing source location')
    const path=value.startsWith('/workspace/')?value.slice('/workspace/'.length):value
    if(!path||path.startsWith('/')||/^[a-z]+:|[\\?#%\x00-\x1f]/i.test(path)||path.split('/').some(p=>['.','..',''].includes(p)))throw new Error('Location outside scanner workspace')
    return path
  }
  for(const run of report.runs??[])for(const result of run.results??[]){
    for(const location of [...(result.locations??[]),...(result.relatedLocations??[])]){
      const physical=location.physicalLocation
      if(physical?.artifactLocation?.uri!==undefined){
        physical.artifactLocation.uri=pathOf(physical.artifactLocation.uri)
        delete physical.artifactLocation.uriBaseId
      }
      if(physical?.region)delete physical.region.snippet
    }
  }
  return report
}
