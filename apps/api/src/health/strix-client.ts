import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { request } from "node:https";
import { createHmac } from "node:crypto";
import type { NativeSourceBundle } from "../execution/native-source.js";
import type { StrixResult } from "./strix-report.js";
export type StrixConnection = { origin: string; apiKey: string; ca: string };
/** An explicit refusal before a job exists; transport failures are never retryable admits. */
export class StrixRunnerBusyError extends Error {
  constructor() {
    super("STRIX_RUNNER_BUSY");
  }
}
export class StrixClient {
  async connection(): Promise<StrixConnection> {
    const file = await open(
      process.env.STRIX_CONNECTION_FILE ??
        resolve(process.cwd(), ".preflyt/strix/connection.json"),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.size > 12000 ||
        (stat.mode & 0o077) !== 0 ||
        (process.getuid && stat.uid !== process.getuid())
      )
        throw new Error("STRIX_CONNECTION_INVALID");
      const value = JSON.parse(await file.readFile("utf8"));
      const url = new URL(value.origin);
      if (
        url.protocol !== "https:" ||
        url.origin !== value.origin ||
        url.username ||
        url.password ||
        typeof value.apiKey !== "string" ||
        value.apiKey.length < 32 ||
        typeof value.ca !== "string" ||
        !value.ca.startsWith("-----BEGIN CERTIFICATE-----")
      )
        throw new Error("STRIX_CONNECTION_INVALID");
      return value;
    } finally {
      await file.close();
    }
  }
  token(connection: StrixConnection, id: string) {
    return createHmac("sha256", connection.apiKey)
      .update("preflyt-strix-model-v1:" + id)
      .digest("hex");
  }
  async call(path: string, body: unknown): Promise<any> {
    const c = await this.connection();
    return new Promise((resolve, reject) => {
      const req = request(
        c.origin + path,
        {
          method: "POST",
          ca: c.ca,
          headers: {
            authorization: "Bearer " + c.apiKey,
            "content-type": "application/json",
          },
          signal: AbortSignal.timeout(30000),
        },
        (res) => {
          if (
            res.statusCode !== 200 &&
            !(path === "/admit" && res.statusCode === 409)
          ) {
            res.resume();
            reject(new Error("STRIX_RUNNER_UNAVAILABLE"));
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          res.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > 8 * 1024 * 1024) {
              res.destroy();
              return;
            }
            chunks.push(chunk);
          });
          res.on("error", () => reject(new Error("STRIX_RESPONSE_INVALID")));
          res.on("end", () => {
            try {
              const value = JSON.parse(Buffer.concat(chunks).toString());
              if (res.statusCode === 409) {
                reject(
                  value?.error === "RUNNER_BUSY"
                    ? new StrixRunnerBusyError()
                    : new Error("STRIX_RUNNER_UNAVAILABLE"),
                );
              } else resolve(value);
            } catch {
              reject(new Error("STRIX_RESPONSE_INVALID"));
            }
          });
        },
      );
      req.on("error", () => reject(new Error("STRIX_RUNNER_UNAVAILABLE")));
      req.end(JSON.stringify(body));
    });
  }
  async status(assessmentId: string, sourceHash: string) {
    return this.call("/status", { assessmentId, sourceHash }) as Promise<
      StrixResult | { state: "NOT_FOUND" }
    >;
  }
  async admit(input: {
    assessmentId: string;
    repositoryId: string;
    source: NativeSourceBundle;
    model: string;
    apiType: string;
    modelToken: string;
    reviewProfile?: 'general' | 'payment-risk-v1' | 'general-and-payment-risk-v1';
    maxModelCalls?: number;
    maxSpecialists?: 1 | 2;
    callbackOrigin: string;
  }) {
    return this.call("/admit", input);
  }
  async cancel(assessmentId: string) {
    return this.call("/cancel", { assessmentId });
  }
}
