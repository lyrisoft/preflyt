# P5 runner qualification: Docker and Kubernetes

The selected preparation target is the existing dedicated Docker controller, shared by Docker and Kubernetes application deployments. Both application deployments select `NATIVE_RUNTIME_BACKEND=docker` and use its reviewed HTTPS origin. Kubernetes application hosting does not require a second native Kubernetes launcher or RuntimeClass for this mode. The shared Docker backend uses the same immutable analyzer images, image-owned adapters, source verification, report format and controller protocol for both application hosting options. Use gVisor `runsc` on the dedicated engine. If Kubernetes-native Jobs are selected later, reuse those images on gVisor nodes with a `runsc` RuntimeClass; creating a RuntimeClass alone does not install the runtime.

## Shared runner contract

- Dedicated Linux workers; repository workloads never share the API/worker host or receive its Docker socket, controller credentials or Kubernetes credentials.
- Exact image digests, tool versions and configuration hashes from the qualification inventory. Local fixture image IDs must be published or transferred and independently reviewed before execution is enabled.
- Fixed source initialization and before/after source verification at the assessed commit. No repository-controlled command override.
- Network isolation, non-root execution, read-only source, dropped capabilities, resource/time/process limits and verified cleanup, enforced by the existing backend contracts.
- The same seeded/clean scanner corpus and source-bound result expectations on both backends. Optional test coverage stays off until explicitly requested.

## Docker target

Prepare a dedicated Linux host or VM with Docker and gVisor `runsc`. The current macOS Docker Desktop installation exposes runc only and is not the qualified target. Give the dedicated controller access to that engine through its supported deployment configuration; do not expose the socket to the application or repository containers. Record the host/engine identity and exact gVisor version. Run the actual escape, metadata, exfiltration, cross-repository, resource-abuse and cancellation tests required by ADR-0002, retaining their evidence. Confirm cleanup and access-revocation behavior. An independent reviewer must attest to this deployment before enabling connected-repository execution.

## Optional Kubernetes-native target

Use dedicated gVisor nodes and a `runsc` RuntimeClass with scheduling constraints for those nodes. Use the existing sandbox namespace, Restricted admission, sandbox ServiceAccount, default-deny network policy, resource quota and limit-range contract. The controller uses a dedicated kubeconfig; repository Jobs cannot access its credentials. Record namespace UID, cluster identity, runtime handler and the inspected controls hash. Execute the same isolation and lifecycle tests against the real cluster; CNI enforcement and node limits require runtime evidence.

## Approval boundaries

The selected shared Docker controller has one deployment-scoped runtime approval, regardless of whether its authorized API/worker clients are hosted in Docker or Kubernetes. Choosing the optional Kubernetes-native job backend requires a separate cluster-specific approval.

Analyzer-image review can identify the same image/configuration artifacts for both deployments. Effective runtime approval is deployment-specific: Docker host evidence does not approve Kubernetes, and Kubernetes evidence does not approve Docker. Reviewer signing keys remain separate from controller keys. No fixture certificate, requested manifest or successful preflight substitutes for actual independent isolation review.

## Prepared application deployment selectors

The existing controller lives in `docs/deployment/native-runner/controller.compose.yaml` with its separate controller environment and mutual-TLS engine connection. Reuse it; do not create a controller inside the application pod or attach an application Docker socket.

For Compose, merge `docs/deployment/native-runner/application.compose.yaml` with the root Compose file. For Kubernetes, render `deploy/kubernetes-shared-docker-runner` using `kubectl kustomize`. The overlay changes only the shared application's runtime backend and disabled environment defaults. API/worker replica counts, storage, networking and credentials retain the base contract; no cluster is contacted by rendering.

Install the deployment's actual reviewed Docker approval, reviewer public keys, analyzer reviews and controller API key through the existing application configuration/Secret contract. Configure the same controller HTTPS endpoint in its signed approval. Do not copy controller signing keys or engine TLS files into API/worker. Existing stored feature switches take precedence over legacy environment defaults; keep admission disabled in Settings until qualification is accepted.

The target is derived from existing deployment configuration and controller contracts. Preparation does not invent a host or use unrelated Kubernetes contexts. The unsigned inventory records pending review and candidate image artifacts; it is not approval evidence.

See [native execution](native-execution.md) and [ADR-0002](../architecture/ADR-0002-safe-execution-fixtures-remediation-contract.md) for the enforced contracts.
