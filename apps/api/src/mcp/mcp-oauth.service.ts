import { createHash, randomBytes } from "node:crypto";
import {
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { digest } from "../assessments/assessment-digest.js";
import { FindingAgentService } from "../findings/finding-agent.service.js";
import { FindingsService } from "../findings/findings.service.js";
import {
  agentScope,
  findingAgentTools,
} from "../findings/finding-agent-contract.js";
const token = (prefix: string) =>
  prefix + randomBytes(32).toString("base64url");
const future = (seconds: number) => new Date(Date.now() + seconds * 1000);
const array = (v: unknown): string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string") ? v : [];
function bad(
  error = "invalid_request",
  message = "The OAuth request is invalid.",
  status = 400,
): never {
  throw new HttpException({ error, error_description: message }, status);
}
const clean = (v: unknown, max = 200): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= max &&
  !/[\x00-\x1f]/.test(v);
function fields(v: any, allowed: string[]) {
  if (
    !v ||
    Array.isArray(v) ||
    typeof v !== "object" ||
    Object.keys(v).some((k) => !allowed.includes(k))
  )
    bad();
}
function redirectUri(value: unknown) {
  if (!clean(value, 1000)) bad("invalid_redirect_uri");
  let uri: URL;
  try {
    uri = new URL(value);
  } catch {
    bad("invalid_redirect_uri");
  }
  if (
    uri!.hash ||
    uri!.username ||
    uri!.password ||
    !["https:", "http:"].includes(uri!.protocol) ||
    (uri!.protocol === "http:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(uri!.hostname))
  )
    bad("invalid_redirect_uri");
  return value;
}
// RFC 8252 native callbacks may change only the HTTP loopback port.
function matchesRedirect(registered: string[], candidate: string) {
  if (registered.includes(candidate)) return true;
  const requested = new URL(candidate);
  if (
    requested.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(requested.hostname)
  )
    return false;
  requested.port = "";
  return registered.some((value) => {
    const previous = new URL(value);
    previous.port = "";
    return previous.href === requested.href;
  });
}
const scopeProperties = {
  origin: { type: "string", enum: ["health", "ci", "ai"] },
  repositoryId: { type: "string" },
  assessmentId: { type: "string" },
  findingId: { type: "string" },
};
const scopedTools = findingAgentTools.map((t) => ({
  ...t,
  description: t.description.replace(
    "single finding authorized by this connection",
    "finding identified by scope",
  ),
  inputSchema: {
    ...t.inputSchema,
    properties: {
      scope: {
        type: "object",
        properties: scopeProperties,
        required: Object.keys(scopeProperties),
        additionalProperties: false,
      },
      ...t.inputSchema.properties,
    },
    required: ["scope", ...t.inputSchema.required],
  },
}));
export const hostedMcpTools = [
  {
    name: "preflyt_list_repositories",
    description:
      "List approved repositories still accessible to this OAuth connection. No access to other repositories.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "preflyt_list_findings",
    description:
      "List a compact page of saved findings in one approved repository. Use the returned scope to read source or submit review evidence.",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        page: { type: "integer", minimum: 1, maximum: 10000 },
      },
      required: ["repositoryId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  ...scopedTools,
];
@Injectable()
export class McpOAuthService {
  constructor(
    @Inject(PrismaService) private db: PrismaService,
    @Inject(AuthorizationService) private access: AuthorizationService,
    @Inject(FindingAgentService) private agents: FindingAgentService,
    @Inject(FindingsService) private findings: FindingsService,
  ) {}
  base() {
    return (
      process.env.PREFLYT_PUBLIC_API_URL ||
      `${(process.env.WEB_ORIGIN || "http://localhost:8080").replace(/\/$/, "")}/api`
    ).replace(/\/$/, "");
  }
  resource() {
    return `${this.base()}/mcp`;
  }
  issuer() {
    return `${this.base()}/mcp-oauth`;
  }
  resourceMetadata() {
    return {
      resource: this.resource(),
      authorization_servers: [this.issuer()],
      scopes_supported: ["findings:read", "findings:review"],
      bearer_methods_supported: ["header"],
      resource_name: "Preflyt findings",
    };
  }
  metadata() {
    const issuer = this.issuer();
    return {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`,
      revocation_endpoint: `${issuer}/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["findings:read", "findings:review"],
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: false,
    };
  }
  challenge() {
    return `Bearer resource_metadata="${this.base()}/.well-known/oauth-protected-resource/mcp", scope="findings:read findings:review"`;
  }
  async register(input: any) {
    fields(input, [
      "client_name",
      "application_type",
      "redirect_uris",
      "grant_types",
      "response_types",
      "token_endpoint_auth_method",
      "scope",
      "client_uri",
      "logo_uri",
      "contacts",
      "tos_uri",
      "policy_uri",
      "software_id",
      "software_version",
    ]);
    if (
      !Array.isArray(input.redirect_uris) ||
      !input.redirect_uris.length ||
      input.redirect_uris.length > 5 ||
      (input.application_type !== undefined &&
        !["native", "web"].includes(input.application_type)) ||
      (input.token_endpoint_auth_method &&
        input.token_endpoint_auth_method !== "none") ||
      (input.grant_types &&
        (!Array.isArray(input.grant_types) ||
          input.grant_types.some(
            (g: unknown) =>
              !["authorization_code", "refresh_token"].includes(String(g)),
          ))) ||
      (input.response_types &&
        (!Array.isArray(input.response_types) ||
          input.response_types.some((g: unknown) => g !== "code")))
    )
      bad("invalid_client_metadata");
    const redirects: string[] = [
      ...new Set<string>(
        input.redirect_uris.map((uri: unknown) => redirectUri(uri)),
      ),
    ];
    if (
      (await this.db.mcpOAuthClient.count({
        where: { createdAt: { gt: new Date(Date.now() - 3600_000) } },
      })) >= 1000
    )
      bad(
        "temporarily_unavailable",
        "Client registration is busy. Try again later.",
        429,
      );
    const name = clean(input.client_name, 80)
      ? input.client_name
      : "MCP client";
    // Client-supplied URLs are never fetched (including logos or metadata URLs).
    const client = await this.db.mcpOAuthClient.create({
      data: { name, redirectUris: redirects },
    });
    return {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: name,
      ...(input.application_type !== undefined
        ? { application_type: input.application_type }
        : {}),
      redirect_uris: redirects,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    };
  }
  async authorize(q: any) {
    fields(q, [
      "client_id",
      "redirect_uri",
      "response_type",
      "code_challenge",
      "code_challenge_method",
      "state",
      "resource",
      "scope",
    ]);
    if (
      !clean(q.client_id) ||
      (q.state !== undefined && !clean(q.state, 1024)) ||
      q.response_type !== "code" ||
      q.code_challenge_method !== "S256" ||
      !clean(q.code_challenge) ||
      !/^[\w-]{43}$/.test(q.code_challenge)
    )
      bad();
    const client = await this.db.mcpOAuthClient.findUnique({
      where: { id: q.client_id },
    });
    const uri = redirectUri(q.redirect_uri);
    if (!client || !matchesRedirect(array(client.redirectUris), uri))
      bad("invalid_request", "The client or callback URL is not registered.");
    if (q.resource !== this.resource())
      bad("invalid_target", "Request this Preflyt MCP resource.");
    const scopes = q.scope ?? "findings:read findings:review";
    if (
      !clean(scopes, 100) ||
      scopes
        .split(" ")
        .some(
          (s: string) => !["findings:read", "findings:review"].includes(s),
        ) ||
      !scopes.split(" ").includes("findings:read")
    )
      bad("invalid_scope");
    await this.db.mcpOAuthAuthorization.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if ((await this.db.mcpOAuthAuthorization.count()) >= 1000)
      bad(
        "temporarily_unavailable",
        "Authorization is busy. Try again later.",
        429,
      );
    const request = await this.db.mcpOAuthAuthorization.create({
      data: {
        clientId: client.id,
        redirectUri: uri,
        resource: q.resource,
        challenge: q.code_challenge,
        state: q.state ?? "",
        scopes: [...new Set(scopes.split(" "))].join(" "),
        expiresAt: future(300),
      },
    });
    return `${process.env.WEB_ORIGIN || "http://localhost:8080"}/integrations?integration=mcp&oauth=${request.id}`;
  }
  private async pending(id: string) {
    if (!clean(id)) bad();
    const row = await this.db.mcpOAuthAuthorization.findUnique({
      where: { id },
    });
    if (!row || row.consumedAt || row.codeHash || row.expiresAt <= new Date())
      bad(
        "invalid_request",
        "This connection request expired or was already used. Start login from your agent again.",
      );
    return row;
  }
  async consent(session: AuthenticatedSession, id: string) {
    const row = await this.pending(id),
      permission = row.scopes.includes("findings:review")
        ? "ai.review.run"
        : "assessment.read";
    await this.access.requireOrganization(session, permission, true);
    const repos = await this.access.repositoryScope(
      session.identityId,
      session.organizationId,
      permission,
    );
    const client = await this.db.mcpOAuthClient.findUniqueOrThrow({
      where: { id: row.clientId },
    });
    return {
      id: row.id,
      clientName: client.name,
      redirectUri: row.redirectUri,
      scopes: row.scopes.split(" "),
      expiresAt: row.expiresAt,
      repositories: repos
        .filter((r) => r.selected && r.available)
        .map((r) => ({ id: r.githubId.toString(), name: r.fullName })),
    };
  }
  async approve(session: AuthenticatedSession, input: any) {
    fields(input, ["id", "repositories", "deny"]);
    const consent = await this.consent(session, input.id),
      row = await this.pending(input.id),
      uri = new URL(row.redirectUri);
    if (row.state) uri.searchParams.set("state", row.state);
    uri.searchParams.set("iss", this.issuer());
    if (input.deny === true) {
      await this.db.mcpOAuthAuthorization.updateMany({
        where: { id: row.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      uri.searchParams.set("error", "access_denied");
      return { redirect: uri.href };
    }
    const repositories = array(input.repositories);
    if (
      !repositories.length ||
      repositories.length > 100 ||
      repositories.some((id) => !consent.repositories.some((r) => r.id === id))
    )
      throw new ForbiddenException("Choose repositories you can access.");
    const code = token("mcc_");
    const changed = await this.db.mcpOAuthAuthorization.updateMany({
      where: {
        id: row.id,
        codeHash: null,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        codeHash: digest(code),
        identityId: session.identityId,
        organizationId: session.organizationId!,
        repositories: [...new Set(repositories)],
      },
    });
    if (changed.count !== 1)
      bad("invalid_request", "This request was already used.");
    uri.searchParams.set("code", code);
    return { redirect: uri.href };
  }
  private async session(row: {
    identityId: string;
    organizationId: string;
    scopes: string;
  }) {
    if (
      !(await this.db.membership.findFirst({
        where: { identityId: row.identityId, active: true },
      }))
    )
      throw new UnauthorizedException("The connection owner is inactive.");
    const session: AuthenticatedSession = {
      authenticated: true,
      identityId: row.identityId,
      organizationId: row.organizationId,
      subject: "hosted-mcp",
      email: null,
      role: "DEVELOPER",
    };
    const member = await this.access.requireOrganization(
      session,
      row.scopes.includes("findings:review")
        ? "ai.review.run"
        : "assessment.read",
      true,
    );
    session.role = member.role;
    return session;
  }
  private credentials() {
    return {
      access_token: token("mca_"),
      refresh_token: token("mcr_"),
      token_type: "Bearer",
      expires_in: 900,
    };
  }
  async exchange(input: any) {
    fields(input, [
      "grant_type",
      "client_id",
      "resource",
      "code",
      "code_verifier",
      "redirect_uri",
      "refresh_token",
      "scope",
    ]);
    if (!clean(input.client_id)) bad("invalid_client");
    if (input.resource !== this.resource()) bad("invalid_target");
    const credentials = this.credentials();
    if (input.grant_type === "authorization_code") {
      if (
        !clean(input.code) ||
        !clean(input.code_verifier, 128) ||
        !/^[\w.~-]{43,128}$/.test(input.code_verifier)
      )
        bad("invalid_grant");
      const row = await this.db.mcpOAuthAuthorization.findUnique({
        where: { codeHash: digest(input.code) },
      });
      if (
        !row ||
        row.consumedAt ||
        row.expiresAt <= new Date() ||
        row.clientId !== input.client_id ||
        row.redirectUri !== input.redirect_uri ||
        row.resource !== input.resource ||
        createHash("sha256").update(input.code_verifier).digest("base64url") !==
          row.challenge ||
        !row.identityId ||
        !row.organizationId
      )
        bad("invalid_grant");
      await this.session({
        identityId: row.identityId!,
        organizationId: row.organizationId!,
        scopes: row.scopes,
      });
      const client = await this.db.mcpOAuthClient.findUniqueOrThrow({
        where: { id: row.clientId },
      });
      await this.db.$transaction(async (tx) => {
        if (
          (
            await tx.mcpOAuthAuthorization.updateMany({
              where: {
                id: row.id,
                consumedAt: null,
                expiresAt: { gt: new Date() },
              },
              data: { consumedAt: new Date() },
            })
          ).count !== 1
        )
          bad("invalid_grant");
        const connection = await tx.mcpOAuthConnection.create({
          data: {
            identityId: row.identityId!,
            organizationId: row.organizationId!,
            clientId: row.clientId,
            clientName: client.name,
            repositories: row.repositories!,
            scopes: row.scopes,
            resource: row.resource,
            accessHash: digest(credentials.access_token),
            refreshHash: digest(credentials.refresh_token),
            accessExpiresAt: future(900),
            expiresAt: future(30 * 86400),
          },
        });
        await tx.auditEvent.create({
          data: {
            event: "mcp.oauth.connected",
            actorId: row.identityId!,
            metadata: {
              organizationId: row.organizationId!,
              connectionId: connection.id,
              clientId: row.clientId,
              repositories: row.repositories!,
              scopes: row.scopes,
            },
          },
        });
      });
      return { ...credentials, scope: row.scopes };
    }
    if (input.grant_type !== "refresh_token" || !clean(input.refresh_token))
      bad("unsupported_grant_type");
    const row = await this.db.mcpOAuthConnection.findUnique({
      where: { refreshHash: digest(input.refresh_token) },
    });
    if (
      !row ||
      row.revokedAt ||
      row.expiresAt <= new Date() ||
      row.clientId !== input.client_id ||
      row.resource !== input.resource
    )
      bad("invalid_grant");
    if (input.scope && input.scope !== row.scopes) bad("invalid_scope");
    await this.session(row);
    const changed = await this.db.mcpOAuthConnection.updateMany({
      where: {
        id: row.id,
        refreshHash: row.refreshHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        accessHash: digest(credentials.access_token),
        refreshHash: digest(credentials.refresh_token),
        accessExpiresAt: future(900),
      },
    });
    if (changed.count !== 1) bad("invalid_grant");
    return { ...credentials, scope: row.scopes };
  }
  async authenticate(header?: string) {
    if (!header || !/^Bearer mca_[\w-]{43}$/.test(header))
      throw new UnauthorizedException(
        "Sign in to Preflyt from your MCP client.",
      );
    const row = await this.db.mcpOAuthConnection.findUnique({
      where: { accessHash: digest(header.slice(7)) },
    });
    if (
      !row ||
      row.revokedAt ||
      row.accessExpiresAt <= new Date() ||
      row.expiresAt <= new Date() ||
      row.resource !== this.resource()
    )
      throw new UnauthorizedException(
        "This MCP connection expired or was disconnected.",
      );
    const session = await this.session(row);
    await this.db.mcpOAuthConnection.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });
    return { connection: row, session };
  }
  async list(session: AuthenticatedSession) {
    await this.access.requireOrganization(session, "assessment.read");
    return this.db.mcpOAuthConnection.findMany({
      where: {
        identityId: session.identityId,
        organizationId: session.organizationId!,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        clientName: true,
        repositories: true,
        scopes: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }
  async revokeConnection(session: AuthenticatedSession, id: string) {
    const row = await this.db.mcpOAuthConnection.findFirst({
      where: {
        id,
        identityId: session.identityId,
        organizationId: session.organizationId!,
      },
    });
    if (!row) bad("invalid_request", "Connection unavailable.", 404);
    await this.db.$transaction(async (tx) => {
      await tx.mcpOAuthConnection.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await tx.findingAgentGrant.updateMany({
        where: { oauthConnectionId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          event: "mcp.oauth.disconnected",
          actorId: session.identityId,
          metadata: {
            connectionId: id,
            organizationId: session.organizationId!,
          },
        },
      });
    });
    return { revoked: true };
  }
  async revokeToken(input: any) {
    fields(input, ["client_id", "token", "token_type_hint"]);
    if (!clean(input.client_id) || !clean(input.token)) return;
    const hash = digest(input.token);
    const row = await this.db.mcpOAuthConnection.findFirst({
      where: {
        clientId: input.client_id,
        OR: [{ accessHash: hash }, { refreshHash: hash }],
      },
    });
    if (row)
      await this.revokeConnection(
        {
          authenticated: true,
          identityId: row.identityId,
          organizationId: row.organizationId,
          role: "DEVELOPER",
          subject: "mcp-revoke",
          email: null,
        },
        row.id,
      );
  }
  async call(
    auth: Awaited<ReturnType<McpOAuthService["authenticate"]>>,
    name: string,
    args: any,
  ) {
    if (name === "preflyt_list_repositories") {
      fields(args, []);
      const repos = [];
      for (const id of array(auth.connection.repositories))
        try {
          const r = await this.access.requireRepository(
            auth.session,
            id,
            "assessment.read",
            true,
          );
          repos.push({ id, repository: r.fullName });
        } catch {}
      return { repositories: repos };
    }
    if (name === "preflyt_list_findings") {
      fields(args, ["repositoryId", "page"]);
      if (!array(auth.connection.repositories).includes(args.repositoryId))
        throw new ForbiddenException(
          "This repository was not approved for this connection.",
        );
      if (
        args.page !== undefined &&
        (!Number.isInteger(args.page) || args.page < 1 || args.page > 10000)
      )
        bad();
      await this.access.requireRepository(
        auth.session,
        args.repositoryId,
        "assessment.read",
        true,
      );
      const result = await this.findings.list(auth.session, {
        repository: args.repositoryId,
        page: args.page ?? 1,
        pageSize: 10,
      });
      return {
        page: args.page ?? 1,
        total: result.total,
        rows: result.rows.map((f: any) => ({
          scope: {
            origin: f.origin ?? "ci",
            repositoryId: f.repositoryId,
            assessmentId: f.assessmentId,
            findingId: f.id,
          },
          title: f.title,
          severity: f.severity,
          path: f.path,
          line: f.line,
          sourceSha: f.sourceSha,
        })),
      };
    }
    const definition = hostedMcpTools.find((t) => t.name === name);
    if (!definition) bad("invalid_request", "Unknown Preflyt tool.");
    const { scope: input, ...payload } = args,
      scope = agentScope(input);
    if (!array(auth.connection.repositories).includes(scope.repositoryId))
      throw new ForbiddenException(
        "This repository was not approved for this connection.",
      );
    const write = [
      "preflyt_submit_verification",
      "preflyt_link_fix_pr",
    ].includes(name);
    if (write && !auth.connection.scopes.split(" ").includes("findings:review"))
      throw new ForbiddenException(
        "This connection has read access only. Reconnect with review access to submit evidence.",
      );
    const resolved = await this.agents.resolve(auth.session, scope);
    if (!write) {
      fields(payload, []);
      return name === "preflyt_get_source_context"
        ? this.agents.source(auth.session, scope)
        : {
            finding: resolved.context,
            ...(await this.agents.history(auth.session, scope)),
          };
    }
    await this.access.requireRepository(
      auth.session,
      scope.repositoryId,
      "ai.review.run",
      true,
      true,
    );
    const grant = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "McpOAuthConnection" WHERE "id"=${auth.connection.id} FOR UPDATE`;
      const live = await tx.mcpOAuthConnection.findUniqueOrThrow({
        where: { id: auth.connection.id },
      });
      if (live.revokedAt || live.expiresAt <= new Date())
        throw new UnauthorizedException(
          "This MCP connection was disconnected.",
        );
      const key = {
        oauthConnectionId: live.id,
        repositoryGithubId: scope.repositoryId,
        origin: scope.origin,
        assessmentId: scope.assessmentId,
        findingId: scope.findingId,
      };
      const prior = await tx.findingAgentGrant.findFirst({ where: key });
      if (prior) {
        if (prior.sourceSha !== resolved.sourceSha || prior.revokedAt)
          throw new ForbiddenException(
            "Finding access was revoked or its source changed.",
          );
        return tx.findingAgentGrant.update({
          where: { id: prior.id },
          data: { expiresAt: live.expiresAt },
        });
      }
      return tx.findingAgentGrant.create({
        data: {
          ...key,
          organizationId: auth.session.organizationId!,
          identityId: auth.session.identityId,
          sourceSha: resolved.sourceSha,
          tokenHash: digest(token("unused_")),
          expiresAt: live.expiresAt,
        },
      });
    });
    return this.agents.append(
      {
        grant,
        session: auth.session,
        scope,
        repository: resolved.repo.fullName,
      },
      name === "preflyt_submit_verification" ? "verification" : "fix_pr",
      payload,
    );
  }
}
