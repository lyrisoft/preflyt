import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  githubRemote,
  repositories,
  agentCommand,
  runAgent,
} from "./preflyt-companion.mjs";
const exec = promisify(execFile);
test("accepts GitHub remotes and refuses ambiguous hosts or command text", () => {
  for (const remote of [
    "git@github.com:org/repo.git",
    "https://github.com/org/repo.git",
    "ssh://git@github.com/org/repo",
  ])
    assert.equal(githubRemote(remote), "org/repo");
  for (const remote of [
    "https://evil.example/org/repo",
    "https://github.com.evil/org/repo",
    "$(touch /tmp/unsafe)",
    "git@github.com:org/repo;curl",
  ])
    assert.equal(githubRemote(remote), null);
});
test("uses scoped MCP configuration and supported permission controls for both agents", async () => {
  const job = {
      agent: "codex",
      mode: "fix",
      mcpUrl: "http://localhost:8080/api/mcp",
    },
    files = { config: "/private/config", output: "/private/output" };
  const codex = await agentCommand(job, "/worktree", files);
  assert.ok(codex.args.includes("workspace-write"));
  assert.ok(codex.args.includes("--ephemeral"));
  assert.ok(
    codex.args.includes(
      'mcp_servers.preflyt_finding.bearer_token_env_var="PREFLYT_FINDING_TOKEN"',
    ),
  );
  assert.ok(!JSON.stringify(codex).includes("dangerously"));
  const claude = await agentCommand(
    { ...job, agent: "claude" },
    "/worktree",
    files,
  );
  assert.ok(claude.args.includes("--strict-mcp-config"));
  assert.ok(claude.args.includes("Read,Grep,Glob,Edit,Write"));
  assert.ok(!JSON.stringify(claude).includes("Bash"));
  assert.ok(!JSON.stringify(claude).includes("skip-permissions"));
});
test("runs a fixture agent in a separate exact-commit worktree without editing the checkout or leaking a token in arguments", async () => {
  const root = await mkdtemp(join(tmpdir(), "preflyt-companion-fixture-")),
    repo = join(root, "repo"),
    bin = join(root, "bin"),
    state = join(root, "state");
  const oldPath = process.env.PATH;
  try {
    await mkdir(repo);
    await mkdir(bin);
    await mkdir(state);
    const git = async (...args) =>
      (await exec("git", ["-C", repo, ...args])).stdout.trim();
    await git("init");
    await git("config", "user.name", "Fixture");
    await git("config", "user.email", "fixture@example.invalid");
    await writeFile(join(repo, "source.txt"), "original\n");
    await git("add", ".");
    await git("commit", "-m", "fixture");
    await git("remote", "add", "origin", "git@github.com:fixture/repo.git");
    const sha = await git("rev-parse", "HEAD");
    assert.equal(
      (await repositories(root)).get("fixture/repo"),
      await realpath(repo),
    );
    await writeFile(
      join(bin, "codex"),
      '#!/usr/bin/env node\nconst fs=require("node:fs");let input="";process.stdin.on("data",b=>input+=b);process.stdin.on("end",()=>{if(process.argv.join(" ").includes(process.env.PREFLYT_FINDING_TOKEN))process.exit(8);fs.writeFileSync("source.txt","fixed\\n");console.log(JSON.stringify({done:true}));});\n',
      { mode: 0o700 },
    );
    process.env.PATH = bin + ":" + oldPath;
    const result = await runAgent(
      {
        id: "fixture-job-1",
        sourceSha: sha,
        agent: "codex",
        mode: "fix",
        task: "Fixture only",
        repository: "fixture/repo",
        mcpUrl: "http://localhost:8080/api/mcp",
        token: "fixture-private-token",
      },
      repo,
      state,
      async () => ({ cancelled: false }),
    );
    assert.equal(
      await readFile(join(repo, "source.txt"), "utf8"),
      "original\n",
    );
    assert.equal(
      await readFile(join(result.worktree, "source.txt"), "utf8"),
      "fixed\n",
    );
    assert.equal(await git("status", "--porcelain"), "");
    assert.equal(result.branch, "preflyt/fix-fixture-job-1");
    await assert.rejects(
      readFile(join(state, "tasks", "fixture-job-1", "mcp.json")),
    );
    await assert.rejects(
      runAgent(
        { id: "bad;command", sourceSha: sha, mode: "fix" },
        repo,
        state,
        () => ({ cancelled: false }),
      ),
    );
  } finally {
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});

test('pairs through a real loopback callback and binds state, issuer and PKCE', async () => {
 const {createServer}=await import('node:http');
 const {createHash}=await import('node:crypto');
 const {pair}=await import('./preflyt-companion.mjs');
 const root=await mkdtemp(join(tmpdir(),'preflyt-pair-fixture-'));
 const oldPath=process.env.PATH;
 let authorization,tokenRequest,wrongStateStatus;
 const server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  const data=JSON.parse(body);
  if(req.url==='/companion-oauth/authorize'){
   authorization=data;
   res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({authorization_url:`http://127.0.0.1:${server.address().port}/integrations?companion=fixture`}));
   setTimeout(async()=>{
    const callback=new URL(data.redirect_uri);callback.searchParams.set('state','wrong');callback.searchParams.set('iss',data.resource);callback.searchParams.set('code','pfc_'+'x'.repeat(43));
    wrongStateStatus=(await fetch(callback)).status;
    callback.searchParams.set('state',data.state);await fetch(callback);
   },100);
  } else {
   tokenRequest=data;
   res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({access_token:'fixture-access',refresh_token:'fixture-refresh'}));
  }
 });
 try {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const binary=process.platform==='darwin'?'open':process.platform==='win32'?'explorer.exe':'xdg-open';
  await writeFile(join(root,binary),'#!/usr/bin/env node\nprocess.exit(0)\n',{mode:0o700});process.env.PATH=root+':'+oldPath;
  const credentials=await pair(`http://127.0.0.1:${server.address().port}`,{name:'fixture',agents:['codex'],repositories:['fixture/repo']});
  assert.equal(credentials.access_token,'fixture-access');assert.equal(wrongStateStatus,400);assert.equal(tokenRequest.redirect_uri,authorization.redirect_uri);assert.equal(createHash('sha256').update(tokenRequest.code_verifier).digest('base64url'),authorization.code_challenge);
 }finally{process.env.PATH=oldPath;server.close();await rm(root,{recursive:true,force:true});}
});
