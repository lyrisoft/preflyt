import 'reflect-metadata';
import { performance } from 'node:perf_hooks';
import { expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import { AuditLogService } from '../src/audit/audit-log.service.js';
import { AuthorizationService } from '../src/auth/authorization.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { disposableDatabase } from './disposable-database.js';

type Plan = { 'Relation Name'?: string; 'Actual Loops'?: number; 'Subplan Name'?: string; Plans?: Plan[] };

it('resolves a large mixed-workspace audit history once without scanning repositories per event', async()=>{
 const fixture=await disposableDatabase('auditperformance'), db=fixture.prisma;
 try {
  await db.organization.createMany({data:[{id:'workspace-a',name:'A'},{id:'workspace-b',name:'B'}]});
  const identity=await db.identity.create({data:{issuer:'fixture',subject:'owner'}});
  await db.organizationMembership.create({data:{organizationId:'workspace-a',identityId:identity.id,role:'OWNER'}});
  for(const id of [1n,2n]) await db.gitHubInstallation.create({data:{id,organizationId:id===1n?'workspace-a':'workspace-b',accountLogin:'fixture',accountType:'Organization',repositorySelection:'all',permissions:{},connectedById:identity.id}});
  await db.gitHubRepository.createMany({data:Array.from({length:100},(_,i)=>({id:'repo-'+i,githubId:BigInt(1000+i),installationId:i<50?1n:2n,name:'repo-'+i,fullName:'fixture/repo-'+i,ownerLogin:'fixture',isPrivate:true,selected:true}))});
  await db.$executeRaw`INSERT INTO "AuditEvent" (id,event,"createdAt",metadata)
   SELECT 'event-'||n, CASE WHEN n%2=0 THEN 'team.synced' ELSE 'policy.published' END,
   TIMESTAMP '2026-10-18 12:00:00'-n*interval '1 second',
   CASE WHEN n%4=0 THEN jsonb_build_object('organizationId','workspace-a')
   WHEN n%4=1 THEN jsonb_build_object('repositoryId','repo-'||(n%100))
   WHEN n%4=2 THEN jsonb_build_object('organizationId','workspace-b')
   ELSE jsonb_build_object('organizationId','workspace-a','repositoryGithubId',(1000+n%50)::text) END
   FROM generate_series(1,100000) n`;
  await db.$executeRaw`ANALYZE`;
  const statements: Prisma.Sql[]=[];
  const measuredDb={
   $transaction: (callback, options)=>db.$transaction(tx=>callback({$queryRaw:query=>{statements.push(query);return tx.$queryRaw(query)}}),options),
   identity: db.identity,
  } as unknown as PrismaService;
  const service=new AuditLogService(measuredDb,new AuthorizationService(db));
  const start=performance.now();
  const result=await service.list({authenticated:true,identityId:identity.id,organizationId:'workspace-a',subject:'owner',email:null,role:'OWNER'},{});
  console.info(`Audit log: 100,000 synthetic events / 100 repositories, ${Math.round(performance.now()-start)} ms`);
  expect(result.total).toBe(63000);expect(result.items).toHaveLength(10);expect(result.hasMore).toBe(true);
  expect(result.actions.map(a=>a.id)).toEqual(['policy.published','team.synced']);
  expect(result.items.every(row=>!row.repository||Number(row.repository.id)<1050)).toBe(true);
  expect(statements).toHaveLength(1);
  const [explain]=await db.$queryRaw<Array<{'QUERY PLAN': Array<{Plan: Plan}>}>>(Prisma.sql`EXPLAIN (ANALYZE, FORMAT JSON) ${statements[0]}`);
  const nodes: Plan[]=[];
  const walk=(node:Plan)=>{nodes.push(node);node.Plans?.forEach(walk)};
  walk(explain['QUERY PLAN'][0].Plan);
  const scope=nodes.filter(node=>node['Subplan Name']==='CTE scoped');
  expect(scope).toHaveLength(1);expect(scope[0]['Actual Loops']).toBe(1);
  const repositories=nodes.filter(node=>node['Relation Name']==='GitHubRepository');
  expect(repositories.length).toBeGreaterThan(0);
  expect(repositories.every(node=>node['Actual Loops']===1)).toBe(true);
 } finally {await fixture.close()}
},30000);
