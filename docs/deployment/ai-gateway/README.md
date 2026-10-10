# Optional LiteLLM gateway

Preflyt can call DeepSeek, OpenAI, Claude, Gemini or Ollama directly. LiteLLM is optional: it sits between Preflyt and those providers and exposes one common API. It routes the request; the selected model performs the review. Use it when a deployment needs a central place to manage several provider connections. Administrators still approve each organization model in Preflyt, test it, configure rates and enable its route. Adding a gateway does not approve a model, enable source sharing or give AI gate authority.

## Docker Compose

The root `compose.ai-gateway.yaml` overlay uses an explicitly pinned multi-architecture LiteLLM v1.98.0 digest. It runs as an unprivileged user with a read-only filesystem, bounded temporary storage, resource limits and rotated logs. Bindings are loopback-only. Set a protected `LITELLM_MASTER_KEY` and keys only for enabled providers. Customize the explicit aliases and provider model names in `config.yaml`; remove aliases you do not use. Model names must be available to your provider account.

```sh
docker compose -f docker-compose.yaml -f compose.ai-gateway.yaml --profile ai-gateway up -d litellm
```

For containerized Preflyt, add a custom self-hosted model using `http://litellm:4000/v1`; for Preflyt running on the host use `http://127.0.0.1:4000/v1`. Enter a configured alias such as `deepseek-review` as the model name and the appropriate gateway key. Authentication stays enabled for this gateway. Test the connection before enabling a route. The gateway logs no prompt content by default. Avoid debug or success callbacks that persist repository source without an explicit organizational data policy.

Keep gateway credentials separate from provider keys. For a single-organization gateway the master key stays within that deployment boundary. For a shared production gateway, use organization-scoped LiteLLM virtual keys and model restrictions; never give tenants or Preflyt organization connections the shared administrative master key. Preflyt retains its own organization, source-sharing, budget and audit checks. Gateway invoice accounting and Preflyt administrator-rate estimates are separate.

## Kubernetes

Create a ConfigMap from the same `config.yaml` and a Secret containing `LITELLM_MASTER_KEY` and the provider keys for enabled aliases, using your existing secret manager. Apply `kubernetes.yaml` into the Preflyt namespace. It contains Deployment, ClusterIP Service and NetworkPolicy. Adjust caller labels to match your existing API/worker pods; the default labels are `app: preflyt-api` and `app: preflyt-worker`. Verify your CNI enforces NetworkPolicy. The default egress allows DNS and public HTTPS; a local model needs a narrowly scoped additional egress rule.

```sh
kubectl create configmap preflyt-ai-gateway --from-file=config.yaml=docs/deployment/ai-gateway/config.yaml --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f docs/deployment/ai-gateway/kubernetes.yaml
```

Do not create secrets through shell arguments or commit their values. Configure the Preflyt self-hosted endpoint as `http://preflyt-ai-gateway:4000/v1` inside this namespace. No gateway database or Kubernetes Operator is required for this file-configured proxy. Shared virtual-key administration can use LiteLLM's separately managed production database; do not reuse or reset Preflyt's application database.

## Verification and rollback

A local smoke test started this pinned image with the production security restrictions, then passed synthetic migration text through LiteLLM to local Ollama qwen2.5:7b. Preflyt validated the structured findings and changed-line references and read reported tokens. Hosted DeepSeek inference was also tested directly with synthetic text. Kubernetes manifests are validated offline; a live cluster deployment is not claimed by that Docker test.

Disable the model route before stopping the optional gateway. Keep connection records, encryption keys and audit history. No application data migration or reset is needed to remove the gateway.

Reference contracts: [LiteLLM production deployment](https://docs.litellm.ai/docs/proxy/deploy), [virtual keys](https://docs.litellm.ai/docs/proxy/virtual_keys).
