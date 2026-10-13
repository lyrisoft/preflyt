import { createServer, type Server } from "node:http";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  allowedAiAddress,
  aiHttpRequest,
} from "../src/intelligence/ai-http.js";
const state = vi.hoisted(() => ({ lookup: vi.fn(), pinned: "" }));
vi.mock("node:dns/promises", () => ({ lookup: state.lookup }));
vi.mock("node:https", () => ({
  request: (_url: URL, options: any, respond: (r: any) => void) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void };
    req.end = () =>
      options.lookup(
        "model.example",
        { family: 0, all: false },
        (error: Error | null, address: string) => {
          if (error) {
            req.emit("error", error);
            return;
          }
          state.pinned = address;
          const response = Readable.from([
            Buffer.from('{"data":[{"id":"model-a"}]}'),
          ]);
          Object.assign(response, { statusCode: 200 });
          respond(response);
        },
      );
    return req;
  },
}));
let servers: Server[] = [];
async function server(handle: Parameters<typeof createServer>[0]) {
  const s = createServer(handle);
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const address = s.address();
  if (!address || typeof address === "string") throw new Error();
  return new URL(`http://127.0.0.1:${address.port}/v1/models`);
}
beforeEach(() => {
  state.lookup
    .mockReset()
    .mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  state.pinned = "";
});
afterEach(async () => {
  await Promise.all(
    servers.map(
      (s) =>
        new Promise<void>((r) => {
          s.closeAllConnections();
          s.close(() => r());
        }),
    ),
  );
  servers = [];
});
it.each([
  "0.0.0.0",
  "169.254.169.254",
  "224.0.0.1",
  "255.255.255.255",
  "::ffff:a9fe:a9fe",
  "fe80::1",
  "ff02::1",
  "::",
  "fd00:ec2::254",
])(
  "rejects reserved and cloud metadata address %s even for self-hosted models",
  (a) => {
    expect(allowedAiAddress(a, "local")).toBe(false);
    expect(allowedAiAddress(a, "hosted")).toBe(false);
  },
);
it.each([
  "127.0.0.1",
  "10.1.2.3",
  "172.16.1.2",
  "192.168.2.3",
  "::1",
  "fc00::1",
  "::ffff:7f00:1",
])(
  "allows explicit self-hosted addresses but rejects them for hosted models: %s",
  (a) => {
    expect(allowedAiAddress(a, "local")).toBe(true);
    expect(allowedAiAddress(a, "hosted")).toBe(false);
  },
);
it("pins a validated DNS answer into the HTTPS connection", async () => {
  const r = await aiHttpRequest(
    new URL("https://model.example/v1/models"),
    "hosted",
    { headers: {}, signal: AbortSignal.timeout(1000) },
  );
  expect(r.status).toBe(200);
  expect(state.lookup).toHaveBeenCalledTimes(1);
  expect(state.pinned).toBe("93.184.216.34");
});
it("rejects mixed public/private and mapped metadata DNS responses before connecting", async () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "::ffff:a9fe:a9fe"]) {
    state.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address, family: address.includes(":") ? 6 : 4 },
    ]);
    await expect(
      aiHttpRequest(new URL("https://model.example/v1/models"), "hosted", {
        headers: {},
        signal: AbortSignal.timeout(1000),
      }),
    ).rejects.toThrow("not allowed");
    expect(state.pinned).toBe("");
  }
});
it("connects to a self-hosted metadata fixture with only explicit headers", async () => {
  let seen = "";
  const url = await server((req, res) => {
    seen = req.headers.authorization ?? "";
    res.end('{"data":[]}');
  });
  const r = await aiHttpRequest(url, "local", {
    headers: { authorization: "Bearer fixture-key" },
    signal: AbortSignal.timeout(1000),
  });
  expect(await r.json()).toEqual({ data: [] });
  expect(seen).toBe("Bearer fixture-key");
});
it("does not follow redirects or read unbounded response bodies", async () => {
  let redirected = false;
  const destination = await server((_req, res) => {
    redirected = true;
    res.end("{}");
  });
  const source = await server((_req, res) => {
    res.writeHead(302, { location: destination.href });
    res.end();
  });
  await expect(
    aiHttpRequest(source, "local", {
      headers: {},
      signal: AbortSignal.timeout(1000),
    }),
  ).rejects.toThrow("redirects");
  expect(redirected).toBe(false);
  const large = await server((_req, res) => res.end("x".repeat(1048577)));
  await expect(
    aiHttpRequest(large, "local", {
      headers: {},
      signal: AbortSignal.timeout(1000),
    }),
  ).rejects.toThrow();
});
it("aborts a hanging response and rejects hosted loopback before issuing a request", async () => {
  let requests = 0;
  const url = await server(() => {
    requests++;
  });
  await expect(
    aiHttpRequest(url, "hosted", {
      headers: {},
      signal: AbortSignal.timeout(100),
    }),
  ).rejects.toThrow("not allowed");
  expect(requests).toBe(0);
  await expect(
    aiHttpRequest(url, "local", {
      headers: {},
      signal: AbortSignal.timeout(20),
    }),
  ).rejects.toThrow();
  expect(requests).toBe(1);
});
it('sends bounded POST bodies to a generated local inference server', async () => {
  let method = '', body = '', auth = ''
  const url = await server((req, res) => {
    method = req.method!; auth = req.headers.authorization ?? ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => { res.writeHead(200); res.end('{"ok":true}') })
  })
  const response = await aiHttpRequest(url, 'local', { headers: { 'content-type': 'application/json', authorization: 'Bearer fixture-key' }, body: '{"input":"fixture"}', signal: AbortSignal.timeout(1000) })
  expect(response.ok).toBe(true); expect(method).toBe('POST'); expect(body).toBe('{"input":"fixture"}'); expect(auth).toBe('Bearer fixture-key')
  await expect(aiHttpRequest(url, 'local', { headers: {}, body: 'a'.repeat(65537), signal: AbortSignal.timeout(1000) })).rejects.toThrow('Request limit')
})
