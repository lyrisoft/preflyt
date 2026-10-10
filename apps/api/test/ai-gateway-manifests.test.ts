import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parse, parseAllDocuments } from "yaml";
const root = new URL("../../../", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, root), "utf8");
it("keeps the optional Docker and Kubernetes gateways on the same bounded unprivileged runtime", () => {
  const compose = parse(read("compose.ai-gateway.yaml")).services.litellm;
  const documents = parseAllDocuments(
    read("docs/deployment/ai-gateway/kubernetes.yaml"),
  ).map((d) => d.toJSON());
  const pod = documents.find((d) => d.kind === "Deployment").spec.template.spec,
    c = pod.containers[0];
  expect(compose.image).toMatch(/@sha256:[a-f0-9]{64}$/);
  expect(c.image).toBe(compose.image);
  expect(compose.profiles).toEqual(["ai-gateway"]);
  expect(compose.ports).toEqual(["127.0.0.1:4000:4000"]);
  expect(compose.read_only).toBe(true);
  expect(compose.cap_drop).toEqual(["ALL"]);
  expect(compose.user).toBe("65532:65532");
  expect(pod.automountServiceAccountToken).toBe(false);
  expect(pod.securityContext.runAsNonRoot).toBe(true);
  expect(c.securityContext).toEqual({
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: true,
    capabilities: { drop: ["ALL"] },
  });
  expect(c.resources.limits).toEqual({ cpu: "1", memory: "1Gi" });
  expect(
    documents.find((d) => d.kind === "Service").spec.type ?? "ClusterIP",
  ).toBe("ClusterIP");
  expect(
    documents.find((d) => d.kind === "NetworkPolicy").spec.policyTypes,
  ).toEqual(["Ingress", "Egress"]);
});
