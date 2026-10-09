import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
const forbidden = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["169.254.0.0", 16],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  forbidden.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 128],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["2001::", 32],
] as const)
  forbidden.addSubnet(address, prefix, "ipv6");
forbidden.addAddress("fd00:ec2::254", "ipv6");
const privateAddresses = new BlockList();
for (const [address, prefix] of [
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
] as const)
  privateAddresses.addSubnet(address, prefix, "ipv4");
privateAddresses.addSubnet("fc00::", 7, "ipv6");
privateAddresses.addAddress("::1", "ipv6");
const publicV6 = new BlockList();
publicV6.addSubnet("2000::", 3, "ipv6");
publicV6.addSubnet("::ffff:0:0", 96, "ipv6");
export function allowedAiAddress(
  address: string,
  locality: "local" | "hosted",
) {
  const family = isIP(address);
  if (!family) return false;
  const type = family === 6 ? "ipv6" : "ipv4";
  if (forbidden.check(address, type)) return false;
  if (privateAddresses.check(address, type)) return locality === "local";
  return family === 4 || publicV6.check(address, "ipv6");
}
/** Pin validated DNS results to this connection. No redirects, proxy agent or ambient credentials. */
export async function aiHttpRequest(
  url: URL,
  locality: "local" | "hosted",
  options: { headers: Record<string, string>; signal: AbortSignal },
) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !allowedAiAddress(host, locality))
    throw new Error("Model endpoint address is not allowed");
  return new Promise<Response>((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(
      url,
      {
        method: "GET",
        headers: options.headers,
        signal: options.signal,
        agent: false,
        lookup: (hostname, settings, callback) => {
          lookup(hostname, { all: true })
            .then((addresses) => {
              if (
                !addresses.length ||
                addresses.some((a) => !allowedAiAddress(a.address, locality))
              )
                throw new Error("Model endpoint address is not allowed");
              const selected = addresses.find(
                (a) => !settings.family || a.family === Number(settings.family),
              );
              if (!selected)
                throw new Error("Model endpoint address unavailable");
              if (settings.all) callback(null, [selected]);
              else callback(null, selected.address, selected.family);
            })
            .catch((e) => {
              if (settings.all) callback(e as Error, []);
              else callback(e as Error, "", 4);
            });
        },
      },
      (res) => {
        if ((res.statusCode ?? 0) >= 300 && (res.statusCode ?? 0) < 400) {
          res.destroy();
          reject(new Error("Model endpoint redirects are not allowed"));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1048576) {
            res.destroy(new Error("Response limit"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("aborted", () =>
          reject(new Error("Model response interrupted")),
        );
        res.on("end", () => {
          try {
            resolve(
              new Response(Buffer.concat(chunks), {
                status: res.statusCode ?? 502,
              }),
            );
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}
