import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { type INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { disposableDatabase } from "./disposable-database.js";
import { SessionGuard } from "../src/auth/session.guard.js";
import { AuthService } from "../src/auth/auth.service.js";
import { AuthorizationService } from "../src/auth/authorization.service.js";
import { RepositoryHealthController } from "../src/health/repository-health.controller.js";
import { RepositoryHealthService } from "../src/health/repository-health.service.js";
import { paymentExportFixture } from "./fixtures/payment-risk-export.js";

let app: INestApplication,
  db: Awaited<ReturnType<typeof disposableDatabase>>,
  assessmentId: string;
beforeAll(async () => {
  db = await disposableDatabase("paymentexport");
  const org = await db.prisma.organization.create({
    data: { name: "Export fixture" },
  });
  const identity = await db.prisma.identity.create({
    data: { issuer: "fixture", subject: "export-owner" },
  });
  await db.prisma.organizationMembership.create({
    data: { identityId: identity.id, organizationId: org.id, role: "OWNER" },
  });
  const owner = {
    authenticated: true,
    identityId: identity.id,
    organizationId: org.id,
    role: "OWNER",
    subject: "export-owner",
    email: null,
  };
  await db.prisma.gitHubInstallation.create({
    data: {
      id: 5n,
      connectedById: identity.id,
      organizationId: org.id,
      accountLogin: "fixture",
      accountType: "Organization",
      repositorySelection: "selected",
      permissions: {},
    },
  });
  const repo = await db.prisma.gitHubRepository.create({
    data: {
      githubId: 51n,
      installationId: 5n,
      name: "payments",
      fullName: "fixture/payments",
      ownerLogin: "fixture",
      isPrivate: true,
      selected: true,
    },
  });
  const data = paymentExportFixture();
  const row = await db.prisma.repositoryHealthAssessment.create({
    data: {
      repositoryId: repo.id,
      organizationId: org.id,
      branch: "main",
      targetRevision: 1,
      requestKey: randomUUID(),
      actorId: identity.id,
      state: "COMPLETED",
      sourceSha: data.sourceSha,
      report: { paymentRiskReport: data.report } as any,
    },
  });
  assessmentId = row.id;
  const access = new AuthorizationService(db.prisma);
  const health = new RepositoryHealthService(
    db.prisma,
    access,
    {} as any,
    {} as any,
    {} as any,
  );
  app = await NestFactory.create(
    {
      module: class ExportModule {},
      controllers: [RepositoryHealthController],
      providers: [
        SessionGuard,
        { provide: AuthorizationService, useValue: access },
        { provide: RepositoryHealthService, useValue: health },
        {
          provide: AuthService,
          useValue: {
            sessionCookieName: "export.sid",
            currentSession: async (token: string) =>
              token === "owner"
                ? owner
                : token === "outsider"
                  ? { ...owner, organizationId: randomUUID() }
                  : { authenticated: false },
          },
        },
      ],
    },
    { logger: false },
  );
  app.use(cookieParser());
  await app.init();
});
afterAll(async () => {
  await app?.close();
  await db?.close();
});
const path = () =>
  `/github/repositories/51/health/${assessmentId}/payment-risk-report`;
it("keeps the internal JSON response and offers complete Markdown and PDF attachments without caching", async () => {
  const json = await request(app.getHttpServer())
    .get(path())
    .set("Cookie", "export.sid=owner")
    .expect(200);
  expect(json.body).toMatchObject({
    assessmentId,
    repository: "fixture/payments",
    sourceSha: "a".repeat(40),
  });
  const md = await request(app.getHttpServer())
    .get(path() + "?format=md")
    .set("Cookie", "export.sid=owner")
    .expect(200)
    .expect("Content-Type", /text\/markdown/)
    .expect("Cache-Control", "no-store");
  expect(md.headers["content-disposition"]).toContain(
    `payment-risk-${assessmentId}.md`,
  );
  expect(md.text).toContain("8. Final risk summary");
  expect(md.text).toContain("payments.py:1-2");
  const pdf = await request(app.getHttpServer())
    .get(path() + "?format=pdf")
    .set("Cookie", "export.sid=owner")
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    })
    .expect(200)
    .expect("Content-Type", "application/pdf")
    .expect("Cache-Control", "no-store");
  expect(pdf.headers["content-disposition"]).toContain(
    `payment-risk-${assessmentId}.pdf`,
  );
  expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
});
it("enforces authentication and repository scope on every format", async () => {
  for (const format of ["md", "pdf"]) {
    await request(app.getHttpServer())
      .get(path() + `?format=${format}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(path() + `?format=${format}`)
      .set("Cookie", "export.sid=outsider")
      .expect(403);
    await request(app.getHttpServer())
      .get(path().replace("/51/", "/99/") + `?format=${format}`)
      .set("Cookie", "export.sid=owner")
      .expect(403);
  }
  await request(app.getHttpServer())
    .get(path() + "?format=html")
    .set("Cookie", "export.sid=owner")
    .expect(400);
});
