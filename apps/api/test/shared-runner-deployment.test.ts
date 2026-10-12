import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {parse} from 'yaml'
import {expect,it} from 'vitest'
const root=resolve(process.cwd(),'../..')
const load=(file:string)=>parse(readFileSync(resolve(root,file),'utf8'))
it('uses the external Docker backend without adding Kubernetes launcher authority',()=>{
 const overlay=load('deploy/kubernetes-shared-docker-runner/kustomization.yaml')
 expect(overlay.resources).toEqual(['../kubernetes'])
 expect(overlay.patches).toEqual([{path:'runner-config.yaml'}])
 const patch=load('deploy/kubernetes-shared-docker-runner/runner-config.yaml')
 expect(patch.kind).toBe('ConfigMap')
 expect(patch.metadata).toEqual({name:'preflyt-config',namespace:'preflyt'})
 expect(patch.data).toEqual({NATIVE_RUNTIME_BACKEND:'docker',NATIVE_PREFLIGHT_ENABLED:'false',NATIVE_EXECUTION_ENABLED:'false'})
 expect(Object.keys(patch).sort()).toEqual(['apiVersion','data','kind','metadata'])
})
it('selects the same disabled backend for both Compose application services',()=>{
 const compose=load('docs/deployment/native-runner/application.compose.yaml')
 expect(Object.keys(compose.services).sort()).toEqual(['api','worker'])
 for(const service of Object.values(compose.services)) expect(service).toEqual({environment:{NATIVE_RUNTIME_BACKEND:'docker',NATIVE_PREFLIGHT_ENABLED:'false',NATIVE_EXECUTION_ENABLED:'false'}})
 const controller=load('docs/deployment/native-runner/controller.compose.yaml').services.controller
 expect(controller.env_file).toBe('controller.env')
 expect(controller.read_only).toBe(true)
 expect(controller.cap_drop).toEqual(['ALL'])
 expect(JSON.stringify(controller)).not.toContain('/var/run/docker.sock')
})
