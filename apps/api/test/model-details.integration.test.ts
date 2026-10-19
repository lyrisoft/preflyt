import "reflect-metadata";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { disposableDatabase } from "./disposable-database.js";
import { AuthorizationService } from "../src/auth/authorization.service.js";
import { modelDetails } from "../src/intelligence/ai-model-details.js";
import { trackModelUsage } from "../src/intelligence/model-usage.js";
let fixture: Awaited<ReturnType<typeof disposableDatabase>>,
  session: any,
  provider: any,
  repo: any,
  other: any,
  access: AuthorizationService;
beforeAll(async () => {
  fixture = await disposableDatabase("modelusage");
});
afterAll(async () => {
  await fixture?.close();
});
it("persists each request's model identity and reported usage through the real recorder", async () => {
  const db = fixture.prisma;
  await trackModelUsage({db,repositoryId:repo.id,workload:"VAPT",sourceId:randomUUID()},provider,undefined,async report=>{
    await report({inputTokens:400,outputTokens:80,cachedTokens:200});return 'response';
  });
  await db.aiProviderConnection.update({where:{id:provider.id},data:{modelId:'changed-model',revision:3}});
  const details=await modelDetails(db,access,session,provider.id,30,1,10);
  expect(details.provider.modelId).toBe('changed-model');
  expect(details.activity[0]).toMatchObject({modelId:'new-model',inputTokens:400,outputTokens:80,requests:1});
  expect((await db.aiModelUsage.findFirstOrThrow()).state).toBe('COMPLETED');
});
beforeEach(async () => {
  await fixture.reset();
  const db = fixture.prisma;
  const org = await db.organization.create({ data: { name: "Usage test" } });
  const identity = await db.identity.create({
    data: { issuer: "fixture", subject: "owner" },
  });
  await db.organizationMembership.create({
    data: { organizationId: org.id, identityId: identity.id, role: "OWNER" },
  });
  session = {
    authenticated: true,
    identityId: identity.id,
    organizationId: org.id,
    role: "OWNER",
    subject: "owner",
    email: null,
  };
  await db.gitHubInstallation.create({
    data: {
      id: 50n,
      accountLogin: "fixture",
      accountType: "Organization",
      repositorySelection: "selected",
      permissions: {},
      connectedById: identity.id,
      organizationId: org.id,
    },
  });
  repo = await db.gitHubRepository.create({
    data: {
      githubId: 51n,
      installationId: 50n,
      name: "repo",
      fullName: "fixture/repo",
      ownerLogin: "fixture",
      isPrivate: true,
      selected: true,
      defaultBranch: "main",
    },
  });
  provider = await db.aiProviderConnection.create({
    data: {
      organizationId: org.id,
      name: "Connection",
      endpointId: "test",
      modelId: "new-model",
      createdById: identity.id,
      revision: 2,
    },
  });
  other = await db.organization.create({ data: { name: "Other org" } });
  access = new AuthorizationService(db);
});
it("scopes totals and history, preserves historical model names and does not count legacy estimates as reported usage", async () => {
  const db = fixture.prisma,
    sourceId = randomUUID();
  const base = {
    organizationId: session.organizationId,
    providerId: provider.id,
    providerRevision: 1,
    modelId: "old-model",
    repositoryId: repo.id,
    workload: "VAPT",
    sourceId,
  };
  await db.aiModelUsage.createMany({
    data: [
      {
        ...base,
        inputTokens: 100,
        outputTokens: 10,
        cachedTokens: 50,
        state: "COMPLETED",
      },
      { ...base, inputTokens: 200, outputTokens: 20, state: "FAILED" },
      { ...base, state: "FAILED" },
      {
        ...base,
        organizationId: other.id,
        inputTokens: 999999,
        outputTokens: 999,
      },
    ],
  });
  const assessment = await db.repositoryHealthAssessment.create({
    data: {
      organizationId: session.organizationId,
      repositoryId: repo.id,
      actorId: session.identityId,
      branch: "main",
      requestKey: randomUUID(),
      targetRevision: 1,
    },
  });
  await db.repositoryHealthStrixRun.create({
    data: {
      assessmentId: assessment.id,
      providerId: provider.id,
      providerRevision: 1,
      routeId: "route",
      routeRevision: 1,
      endpointDigest: "digest",
      tokenHash: "hash",
      inputTokens: 4000000,
      outputTokens: 8192,
      modelCalls: 35,
    },
  });
  const result = await modelDetails(
    db,
    access,
    session,
    provider.id,
    30,
    1,
    10,
  );
  expect(result.totals).toMatchObject({
    inputTokens: 300,
    outputTokens: 30,
    cachedTokens: 50,
    requests: 3,
    unreportedInput: 1,
    unreportedOutput: 1,
  });
  expect(result.activity).toHaveLength(1);
  expect(result.activity[0]).toMatchObject({
    requests: 3,
    failedRequests: 2,
    unreportedRequests: 1,
    modelId: "old-model",
    repository: { fullName: "fixture/repo" },
  });
  expect(result.byModel[0].modelId).toBe("old-model");
  expect(result.legacyVapt[0]).toMatchObject({
    inputTokens: 4000000,
    modelId: null,
  });
  expect(result.provider).not.toHaveProperty("encryptedCredential");
  await expect(
    modelDetails(
      db,
      access,
      { ...session, organizationId: other.id },
      provider.id,
      30,
      1,
      10,
    ),
  ).rejects.toThrow();
});
it("excludes repositories outside the reader's grants from totals and activity", async () => {
  const db=fixture.prisma;
  const hidden=await db.gitHubRepository.create({data:{githubId:52n,installationId:50n,name:'hidden',fullName:'fixture/hidden',ownerLogin:'fixture',isPrivate:true,selected:true}});
  const identity=await db.identity.create({data:{issuer:'fixture',subject:'auditor'}});
  const member=await db.organizationMembership.create({data:{identityId:identity.id,organizationId:session.organizationId,role:'AUDITOR'}});
  await db.repositoryGrant.create({data:{membershipId:member.id,repositoryId:repo.id}});
  const base={organizationId:session.organizationId,providerId:provider.id,providerRevision:2,modelId:'new-model',workload:'VAPT',state:'COMPLETED'};
  await db.aiModelUsage.createMany({data:[{...base,sourceId:randomUUID(),repositoryId:repo.id,inputTokens:10,outputTokens:2},{...base,sourceId:randomUUID(),repositoryId:hidden.id,inputTokens:9000,outputTokens:900}]});
  const scoped=await modelDetails(db,access,{...session,identityId:identity.id,role:'AUDITOR'},provider.id,30,1,10);
  expect(scoped.totals).toMatchObject({inputTokens:10,outputTokens:2,requests:1});
  expect(JSON.stringify(scoped)).not.toContain('fixture/hidden');
});
it("paginates grouped activity while keeping totals independent of the page", async () => {
  const db = fixture.prisma;
  await db.aiModelUsage.createMany({
    data: Array.from({ length: 11 }, () => ({
      organizationId: session.organizationId,
      providerId: provider.id,
      providerRevision: 2,
      modelId: "new-model",
      repositoryId: repo.id,
      workload: "AI_REVIEW",
      sourceId: randomUUID(),
      inputTokens: 10,
      outputTokens: 2,
      state: "COMPLETED",
    })),
  });
  const page = await modelDetails(db, access, session, provider.id, 30, 2, 10);
  expect(page.activity).toHaveLength(1);
  expect(page.total).toBe(11);
  expect(page.totals).toMatchObject({
    inputTokens: 110,
    outputTokens: 22,
    requests: 11,
  });
  await expect(
    modelDetails(db, access, session, provider.id, 999, 1, 10),
  ).rejects.toThrow();
  await expect(
    modelDetails(db, access, session, provider.id, 30, 0, 10),
  ).rejects.toThrow();
});
