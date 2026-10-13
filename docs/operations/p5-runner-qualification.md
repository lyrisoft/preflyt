# P5 runner qualification: Docker and Kubernetes

The selected preparation target is the existing dedicated Docker controller, shared by Docker and Kubernetes application deployments. Both application deployments select `NATIVE_RUNTIME_BACKEND=docker` and use its reviewed HTTPS origin. Kubernetes application hosting does not require a second native Kubernetes launcher or RuntimeClass for this mode. The shared Docker backend uses the same immutable analyzer images, image-owned adapters, source verification, report format and controller protocol for both application hosting options. Use gVisor `runsc` on the dedicated engine. If Kubernetes-native Jobs are selected later, reuse those images on gVisor nodes with a `runsc` RuntimeClass; creating a RuntimeClass alone does not install the runtime.

## Shared runner contract

- Dedicated Linux workers; repository workloads never share the API/worker host or receive its Docker socket, controller credentials or Kubernetes credentials.
- Exact image digests, tool versions and configuration hashes from the qualification inventory. Image IDs must be transferred to the dedicated engine and checked against signed tool reviews before execution is enabled.
- Fixed source initialization and before/after source verification at the assessed commit. No repository-controlled command override.
- Network isolation, non-root execution, read-only source, dropped capabilities, resource/time/process limits and verified cleanup, enforced by the existing backend contracts.
- The same seeded/clean scanner corpus and source-bound result expectations on both backends. Repository Health runs static analysis only; test coverage comes from an actual CI report bound to the assessed commit. The historical manual test-coverage adapter is not part of new Health runner qualification.

## Docker target

Prepare a dedicated Linux host or VM with Docker and gVisor `runsc`. The current macOS Docker Desktop installation exposes runc only and is not the qualified target. Give the dedicated controller access to that engine through its supported deployment configuration; do not expose the socket to the application or repository containers. Record the host/engine identity and exact gVisor version. Run the actual escape, metadata, exfiltration, cross-repository, resource-abuse and cancellation tests required by ADR-0002, retaining their evidence. Confirm cleanup and access-revocation behavior. Connected-repository execution requires a signed, deployment-scoped approval recording the responsible operator and tested controls.

## Optional Kubernetes-native target

Use dedicated gVisor nodes and a `runsc` RuntimeClass with scheduling constraints for those nodes. Use the existing sandbox namespace, Restricted admission, sandbox ServiceAccount, default-deny network policy, resource quota and limit-range contract. The controller uses a dedicated kubeconfig; repository Jobs cannot access its credentials. Record namespace UID, cluster identity, runtime handler and the inspected controls hash. Execute the same isolation and lifecycle tests against the real cluster; CNI enforcement and node limits require runtime evidence.

## Approval boundaries

The selected shared Docker controller has one deployment-scoped runtime approval, regardless of whether its authorized API/worker clients are hosted in Docker or Kubernetes. Choosing the optional Kubernetes-native job backend requires a separate cluster-specific approval.

Analyzer-image review can identify the same image/configuration artifacts for both deployments. Effective runtime approval is deployment-specific: Docker host evidence does not approve Kubernetes, and Kubernetes evidence does not approve Docker. Approval signing keys remain separate from controller keys. A successful preflight does not substitute for runtime isolation evidence. This local deployment uses signed operator approval under the owner’s explicit authorization; it does not claim independent review.

## Prepared application deployment selectors

The existing controller lives in `docs/deployment/native-runner/controller.compose.yaml` with its separate controller environment and mutual-TLS engine connection. Reuse it; do not create a controller inside the application pod or attach an application Docker socket.

For Compose, merge `docs/deployment/native-runner/application.compose.yaml` with the root Compose file. For Kubernetes, render `deploy/kubernetes-shared-docker-runner` using `kubectl kustomize`. The overlay changes only the shared application's runtime backend and disabled environment defaults. API/worker replica counts, storage, networking and credentials retain the base contract; no cluster is contacted by rendering.

Install the deployment's actual reviewed Docker approval, approval public keys, analyzer reviews and controller API key through the existing application configuration/Secret contract. Configure the same controller HTTPS endpoint in its signed approval. Do not copy controller signing keys or engine TLS files into API/worker. Existing stored feature switches take precedence over legacy environment defaults; enable admission only while the signed deployment approval and exact tool reviews remain valid.

The target is derived from existing deployment configuration and controller contracts. Preparation does not invent a host or use unrelated Kubernetes contexts. The inventory records candidate artifacts; signed approval and retained probe evidence establish this deployment’s authorization.

See [native execution](native-execution.md) and [ADR-0002](../architecture/ADR-0002-safe-execution-fixtures-remediation-contract.md) for the enforced contracts.

## Local deployment evidence, 12 October 2026

A dedicated ARM64 Lima VM named `preflyt-runner` now runs Docker 29.9.0 and gVisor `release-20261005.0`, with no host-directory mounts. The existing controller Compose definition runs in `/var/lib/preflyt/runner`, with its durable journal at `/var/lib/preflyt/native-jobs`. Controller credentials and TLS private keys remain inside the VM. Docker's mutual-TLS listener binds only to the VM's Docker bridge (`172.17.0.1:2376`); the HTTPS proxy binds guest loopback and is forwarded to `https://localhost:9443`. This endpoint is local development infrastructure, not a deployed remote Kubernetes endpoint.

The controller image is `preflyt-native-controller@sha256:885c150f7cbff5b17ca19fd602271f6e817827da5425d42e611c348ac539f1fb`. HTTPS liveness and the controller-to-engine TLS connection passed; missing API credentials return 401 and missing engine client certificates are rejected. Execution was enabled after signed operator approval was installed in the controller and application, along with exact reviewed tool identities. The operator signing key is held separately from controller keys and is not supplied to scanner containers. The approval is time-limited and applies only to this dedicated local VM and selected scope.

Generated gVisor boundary probes verified denied root/source writes, unavailable Docker sockets/devices, blocked metadata and outbound connections, inaccessible sibling source, bounded scratch/report storage and cancellation cleanup. A 3 GiB allocation was OOM-killed under the 2 GiB limit (exit 137); bounded process creation was stopped; a CPU probe recorded actual cgroup throttling at one CPU. Cleanup was confirmed and the controller stayed healthy. These are observed controls for this deployment; they do not establish an independent escape-resistance assessment. The initial network probe was corrected to inspect links using `ip`, since gVisor does not expose `/sys/class/net`.

All 22 generated static scanner fixtures passed their expected outcomes under `runsc`: 13 Semgrep, two Gitleaks, two duplication, three IaC and two dependency cases. Seeded fixtures are expected to return FAIL; clean fixtures return PASS. The existing harness now accepts `NATIVE_FIXTURE_RUNTIME=runsc` or `kata` (default `runc` remains fixture-only). Run it on the dedicated host where the generated source paths and engine mounts coincide, with `NATIVE_FIXTURE_TOOL` and the exact `NATIVE_FIXTURE_IMAGE` ID.

The added clean IaC case exposed a Trivy configuration defect: `include-non-failures: true` emitted successful checks as SARIF results, producing 51 false findings on clean Terraform. It is now false, and both Trivy images were rebuilt. The dependency database was also refreshed after its actual `UpdatedAt` exceeded 24 hours; downloading an old database does not make it current.

Verified candidate image identities:

| Analyzer | Image digest |
| --- | --- |
| Semgrep | `sha256:ab136eaf5352c9ad2d53ea454fbae762ecf0e634e50e82124bef4bd64e2e8533` |
| Gitleaks | `sha256:59921212cf16e26e5931cf3dd8d52fe9bff94de0d49c1dcbd28ad70d5af3b28f` |
| Duplication | `sha256:1bb46d1ca943e996b14ef6e5147b3e8b76cc068c0d93eb0843afb29748493a49` |
| Trivy IaC | `sha256:b91723a7a1f9718a941aa01030d65ba2b0132eb1fc50f2f206deca9067a3ee98` |
| Trivy dependencies | `sha256:92e26df499ae57ddd4f29e5e2e8574dc6b7cc2554b4d0eac028b29f1dff8ae61` |

Thirty focused tests passed across Docker approval, effective container inspection, controller lifecycle and runtime selection during initial qualification. The shared Kubernetes application overlay rendered successfully; no Kubernetes cluster was changed or qualified. The signed local operator approval and tool reviews are installed, and authenticated preflight reports the Docker controller ready. A live assessment of the small acceptance repository completed six applicable static checks with verified receipts; the overall report remains partial because five checks have limited rule coverage. The Preflyt repository reassessment and larger-source handling require separate result verification. Do not describe this local evidence as production qualification or infer complete repository health from partial analyzer coverage.
