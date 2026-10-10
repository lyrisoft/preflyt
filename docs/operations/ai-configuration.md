# Organization AI configuration

Application connections and feature switches are now provisioned in **Settings → Configuration** by Super Admin. Environment names below describe the legacy import contract; once stored, database values take precedence. See [deployment configuration](deployment-configuration.md). Infrastructure and execution trust controls remain deployment-managed.

## Current delivery

Owner/Admin users can open **AI Intelligence → Models / Review skills / Model router**. The API supports multiple organization-scoped admin-approved models, encrypted write-only keys, metadata-only connection tests, optimistic revisions and stage-specific primary/fallback routing. Auditors can read configuration through the API; developers cannot change provider keys or routes.

Approved instruction-only skills and explicit saved-assessment reviews are now implemented behind `AI_REVIEWS_ENABLED`. Connection tests remain metadata-only; saving configuration never invokes inference. Daily budget reservations, bounded primary/fallback execution, cancellation and structured check references are available for this evidence-only runtime. Bounded contextual PR diff review, opt-in GitHub summary/inline feedback and provider-reported token usage are implemented. Cost estimates use administrator rates; they are not provider invoices. The optional LiteLLM gateway is available for Docker Compose or Kubernetes. See [review skills setup and limits](review-skills.md). AI output never changes a deterministic gate.

## Deployment defaults

Apply the additive Prisma migrations and regenerate the client. Preserve a protected database backup first. Set:

- `AI_CONFIGURATION_ENABLED=false` by default. Turn on to expose connection setup.
- `AI_REVIEWS_ENABLED=false` by default. Enable in API and worker only when configured routes, tested connections and reviewed skills are ready.
- `AI_PROVIDER_ENCRYPTION_KEY`: a separate persistent base64-encoded 32-byte key (`openssl rand -base64 32`). Store it in your deployment secret manager. Do not reuse the GitHub token key, commit it or replace it casually: existing keys cannot be decrypted after replacement. Retain it with protected backups.
Model endpoint approval is managed inside Preflyt. There is no deployment endpoint allowlist.

## Built-in providers

**AI Intelligence → Models** always offers OpenAI (ChatGPT), Anthropic (Claude), Google (Gemini), and DeepSeek. These are inactive presets, not automatically created credentials or network requests. Click **Activate**, enter the exact provider API **model name** and an API key, and save. Preflyt fills in the endpoint, hosting and authentication. Activation saves an enabled, organization-approved connection; it does not imply the key has been tested or enable inference. Click **Test** before configuring an enabled route. Configure lets admins change the model/key or disable the connection; leaving an existing key blank preserves it.

Model name is the identifier accepted by the provider API, rather than a product/display label such as “ChatGPT”. Examples shown in placeholders are examples, not automatic model selections or guarantees of account access. Bring an API key from the selected provider. The custom **Add model** flow remains available for other OpenAI-compatible providers and self-hosted servers, with new custom models disabled by default.

Preset endpoint and authentication settings are resolved by the server. OpenAI and DeepSeek use Bearer authentication and their model list; Anthropic uses `x-api-key` plus its API version header and retrieves the selected model; Gemini uses `x-goog-api-key` and retrieves the selected model. Keys are never placed in URLs. Native metadata retrieval avoids model-list pagination for Claude/Gemini. References: [OpenAI models](https://developers.openai.com/api/reference/resources/models/methods/list), [Anthropic models](https://platform.claude.com/docs/en/api/models/retrieve), [Gemini models](https://ai.google.dev/api/models), [DeepSeek models](https://api-docs.deepseek.com/api/list-models/).

## Add and approve a custom model

Open **AI Intelligence → Models → Add model** as an organization Owner or Admin. Enter a display name, the OpenAI-compatible base URL (for example `https://api.example.com/v1`), Hosting (Hosted provider or Self-hosted model), and the model ID accepted by that endpoint. Enter an API key if the server requires one. **Saving approves the model for this organization**, with an approval audit event tied to its revision and endpoint digest. There is no separate operator approval or environment model list. New models remain disabled until explicitly enabled. Test the connection before selecting it in an enabled route.

Hosted endpoints require HTTPS and publicly routable addresses. Select Self-hosted explicitly for a local/private model server; local HTTP is supported. Choosing self-hosted defaults the API-key requirement off. Enable “Provider requires an API key” when your server requires authentication. Base URLs exclude credentials, query parameters and fragments. Custom servers use the OpenAI-compatible API. If a self-hosted URL contains only a host and port, Preflyt uses `/v1` for both metadata tests and reviews; explicit paths are preserved. For Ollama, `http://localhost:11434` and `http://localhost:11434/v1` both work without a key when authentication is disabled. The selected model must already be installed. A custom connection test sends only a GET to `<API base>/models` with the configured key, when present. A missing model-list endpoint is a connection failure; a successful list without the selected model is “Model unavailable”. See [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility). When the API/worker runs in Docker, `localhost` means that container; use a reachable model service address or `host.docker.internal` for a host service where supported. Built-in tests use the metadata endpoints described above. DNS results are checked and pinned into the actual connection; redirects, mixed public/private hosted results, cloud metadata/link-local addresses and unbounded responses are rejected. Responses time out after ten seconds and are bounded to 1 MiB. Deployment network controls remain useful defense in depth. Native provider inference transport is implemented for explicit saved-assessment reviews. An optional digest-pinned LiteLLM Compose overlay and matching Kubernetes deployment are available; see [gateway deployment](../deployment/ai-gateway/README.md).

## Key and routing behavior

Keys are AES-256-GCM encrypted and bound to organization, connection identity and endpoint transport definition. They are never returned in API responses or audit metadata. Editing a model endpoint's address, hosting or key requirement requires a new key when the model requires authentication. Saving an edit resets connection readiness. Changing the model ID requires another connection test. Edits reset test readiness. Connection tests are limited to 12 per organization per ten-minute window.

A route can be configured separately for local development, repository, pull requests, QA, performance and production. Built-in presets start inactive; activation requires a model name and key. Custom models, routes and source sharing start disabled. Enabling a route requires its selected primary and optional fallback connections to be enabled and tested against the current model/endpoint/revision within 24 hours. A routing preview rechecks freshness and can select a ready fallback. It reports unavailable/source-sharing/token-limit states without generating a model request. Source-sharing permission does not authorize a future request to include credentials or unrelated repositories.

All reads and writes are checked against current organization membership. Mutations validate origin and reject unknown fields. Concurrent edits cannot overwrite a newer revision. Configuration and test audits exclude keys/upstream error bodies. Organization foreign keys use `RESTRICT`, preserving connections/routes if someone attempts to delete their organization.

## Verification and rollback

Unit and disposable-database API tests cover authenticated encryption, endpoint changes, organization isolation, RBAC, CSRF, stale/concurrent edits, revoked access, provider failures, throttling, routing defaults and freshness. Tests create a local UUID database before any writes and drop only that database; they never truncate the application database. Chromium tests cover page access, separate tabs, failure states and default-off forms. No real provider credentials or repository source are sent during these tests.

Rollback: disable `AI_CONFIGURATION_ENABLED` and retain tables, audits and encryption secrets. Do not drop organization/application tables, reset the database or rotate the encryption key to roll back the UI. The evidence-only runtime now implements estimated budget reservations, cancellation and fixture-tested gate independence. Bounded contextual PR review and automatic dispatch are now implemented; language/framework selection, reported provider usage and optional LiteLLM deployment are now implemented; live private-repository GitHub acceptance passed; production deployment qualification is recorded separately. See [automatic review setup](review-skills.md#automatic-pr-reviews-and-github-feedback).

## Upgrade from the initial connection setup

Apply additive migration `20261010006000_admin_ai_models`. Existing records and encrypted keys are retained. Records created against the former deployment allowlist need their endpoint entered in **Edit model** and a new key when required; they remain unavailable for routing until updated and tested. The obsolete environment model list is ignored. Do not reset or delete records to upgrade.

Model status colors follow the shared badge tokens: approval and a successful test are green, rejected keys/missing models/connection failures are red, and disabled or untested states are neutral. Approval and connection readiness remain separate states.

Model actions use aligned icons and consistent control heights. Model/routing forms keep Cancel and Save compact at the right of a separated footer. Testing displays progress, prevents repeated submissions, and reports failures without a success notice. The shared button uses bounded color/border/shadow transitions and respects reduced motion. This follow-up passed 63 API/transport tests, 18 Chromium tests, builds and types. A metadata-only live test against local Ollama returned CONNECTED for llama3.2:3b; no live inference or repository source was sent.
