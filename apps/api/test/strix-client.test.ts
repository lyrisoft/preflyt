import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("node:https", () => ({ request: vi.fn() }));
import { request } from "node:https";
import {
  StrixClient,
  StrixRunnerBusyError,
} from "../src/health/strix-client.js";

afterEach(() => vi.clearAllMocks());
function fixture(status: number, body: string) {
  vi.mocked(request).mockImplementation(((
    _url: any,
    _options: any,
    callback: any,
  ) => {
    const req = new EventEmitter() as any;
    req.end = () => {
      const res = new EventEmitter() as any;
      res.statusCode = status;
      res.resume = vi.fn();
      res.destroy = () => res.emit("error", new Error("closed"));
      callback(res);
      queueMicrotask(() => {
        res.emit("data", Buffer.from(body));
        res.emit("end");
      });
    };
    return req;
  }) as any);
  const client = new StrixClient();
  vi.spyOn(client, "connection").mockResolvedValue({
    origin: "https://127.0.0.1:3012",
    apiKey: "fixture",
    ca: "fixture",
  });
  return client;
}
it("recognizes only the explicit pre-admission busy refusal as retryable", async () => {
  const client = fixture(409, JSON.stringify({ error: "RUNNER_BUSY" }));
  await expect(client.call("/admit", {})).rejects.toBeInstanceOf(
    StrixRunnerBusyError,
  );
  await expect(client.call("/status", {})).rejects.not.toBeInstanceOf(
    StrixRunnerBusyError,
  );
});
it.each(["{}", "{broken", '{"error":"OTHER_CONFLICT"}'])(
  "does not treat other conflicts or malformed replies as safe admission retries: %s",
  async (body) => {
    const client = fixture(409, body);
    await expect(client.call("/admit", {})).rejects.not.toBeInstanceOf(
      StrixRunnerBusyError,
    );
  },
);
it("returns successful runner replies unchanged", async () => {
  const client = fixture(200, '{"state":"RUNNING"}');
  await expect(client.call("/admit", {})).resolves.toEqual({
    state: "RUNNING",
  });
});
