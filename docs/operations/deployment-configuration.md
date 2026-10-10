# Deployment configuration

Super Admin provisions application settings in **Settings → Configuration**. These settings apply to every workspace. Organization Owners and Admins cannot change deployment credentials or capabilities. Organization AI models, provider keys, skills, CI bindings and policies retain their existing organization-scoped administration pages.

## What moves into the database

| Section | Stored settings |
| --- | --- |
| GitHub | Assessment App ID, client ID/secret, RSA private key, webhook secret, installation/login callbacks, sign-in and event ingestion switches |
| Governance | Separate governance App credentials and installation ID, manual/automatic check publication, ruleset activation, history import and retention |
| Single sign-on | OIDC issuer, client ID/secret and callback |
| Notifications | In-app/email switches and SMTP host, port, sender, username and password |
| Intelligence | Model configuration and advisory review switches |
| Native execution | Preflight and execution switches |

The field catalogue in `apps/api/src/configuration/configuration-catalogue.ts` is the authoritative allowlist. `/configuration` rejects unknown fields. Saving validates formats and activation prerequisites; capability switches never replace runtime isolation approvals, organization authorization, model/skill approval, source-sharing consent or ruleset approval.

## What stays in deployment configuration

Infrastructure must be available before the database can be read. Keep database/migration connections, cache/queue URLs and namespaces, API host/port, public origin, cookie security, bootstrap/Super Admin recovery credentials, telemetry, frontend build settings and LiteLLM deployment configuration in environment variables or your deployment secret manager.

Keep encryption roots and execution trust material outside the database: `CONFIGURATION_ENCRYPTION_KEY`, `GITHUB_USER_TOKEN_ENCRYPTION_KEY`, `AI_PROVIDER_ENCRYPTION_KEY`, native runtime/controller credentials, runtime and tool review approvals, CI proof mode, attestation/signer keys and execution contracts. The native controller retains its own deployment-managed `NATIVE_EXECUTION_ENABLED` switch and has no access to deployment configuration and explicitly rejects the configuration encryption root in its environment. Development-only insecure SMTP and local governance acceptance overrides also remain deployment controls.

Generate **three separate** 32-byte base64 keys for the three encryption roots; `openssl rand -base64 32` produces the right format. Never reuse a key, commit its value, enter it into Settings or rotate it by simply changing the environment. Back up each key in your secret manager independently of the database. Losing or replacing `CONFIGURATION_ENCRYPTION_KEY` prevents decryption of stored deployment credentials. Restore the original key and restart; this implementation does not provide key rotation.

## Startup and migration

1. Take a protected database backup and retain the current environment in a protected secret store. Never reset the database.
2. Provision a stable `CONFIGURATION_ENCRYPTION_KEY` in the API and worker. Apply `20261010100000_deployment_configuration` using the migration role.
3. Start the API with the existing application environment still present. If no configuration row exists, the API imports the allowlisted values once, encrypts the secrets and creates the singleton. A worker waits for the API's initial import and cannot seed from its smaller environment.
4. Sign in as Super Admin and verify Settings → Configuration. Remove the imported application variables from your deployed environment only after verification. Keep the infrastructure, recovery and trust values listed above. Restart API and worker with the reduced environment and verify again.

Once a row exists, database values are authoritative. Legacy environment values cannot overwrite it, including empty stored values. Compose retains legacy variable forwarding for upgrades; fresh installs can omit these values and provision the connection in Settings. Existing env examples now list deployment controls rather than application settings. On a fresh install, provision the Super Admin recovery login to access Configuration before enabling normal identity-provider sign-in.

## Applying changes

Connection settings (GitHub, governance credentials, OIDC, SMTP and GitHub sign-in) require restarting **both API and worker**. The UI shows a restart notice; the running process keeps its previous connection snapshot until restart, so cached clients do not silently use mixed credentials.

Feature switches and history retention are refreshed every five seconds. Background consumers apply switches on their next five-second reconciliation tick. If a database read or credential decryption fails, live switches are disabled until a successful read; Preflyt never falls back to old environment overrides. A startup decryption failure prevents starting with the wrong credentials.

Secret fields remain empty in the browser. An empty replacement keeps the saved credential; **Clear saved**, followed by Save changes, explicitly removes it. The API returns only whether each secret is configured. Credentials use AES-256-GCM with authenticated context and random nonces; public configuration and audit records contain no secret values. Concurrent saves use a revision check: refresh after a conflict rather than overwriting someone else's edits. Audit events record the administrator, changed field names and revision.

## Docker and Kubernetes

Supply the same configuration encryption root in Compose API/worker environments or Kubernetes `preflyt-api-secrets` and `preflyt-worker-secrets`. Never give it to scan containers or the execution controller. Apply migrations before starting application processes. For API/worker replicas, restart all replicas after connection edits; a rolling deployment can temporarily have different startup snapshots. Use a maintenance restart for authentication changes. Feature toggles do not need a deployment.

Production governance still requires a separate privileged GitHub App. Configure its credentials in this tab; keep the development-only shared-App override out of production. Existing checks for permissions, installation scope, approvals and exact-commit evidence remain in force.


### Public API address for GitHub Actions

Set `PREFLYT_PUBLIC_API_URL` using **Settings → Configuration → Public Preflyt API URL** once. Snippets and the optional workflow editor use this deployment value. It must be an HTTPS API address reachable by GitHub runners, without credentials, query parameters or fragments; localhost is rejected. Changes are read at runtime and do not require an API restart. Existing reviewed workflows retain their embedded URL until their snippet is updated.
