# Repository stack file hints

Repository profiling now recognizes Terraform (`.tf`, `.tf.json`, `.tfvars`, `.tfvars.json`), HCL and YAML, modern JavaScript/TypeScript variants, scripting languages, common web/source formats, and additional infrastructure formats including Bicep, Jsonnet, CUE and Nix. GraphQL and Protocol Buffers definitions also produce language hints. Terraform and YAML have dedicated inventory icons.

Detection retains exact file/blob evidence. File names alone do not establish framework usage, executed analysis or scanner support. Generic YAML does not establish Kubernetes or Helm usage. Extension lookup excludes inherited object properties such as `constructor` and `__proto__`. Generic JSON, Markdown documentation and Terraform state are not treated as stack languages. Terraform dependency/cache directories join existing dependency/generated/agent-skill exclusions. Case-insensitive extensions are supported, with uppercase `.C` retained as C++ and ambiguous `.h` reported as C/C++.

Local verification: 88 API tests passed across profile discovery, inventory projection and profile integration suites; 9 inventory browser tests passed. Web/API TypeScript, focused UI lint and diff whitespace checks passed. Tests use fixtures and a disposable local database; no connected repositories were rescanned.

Deploy the updated API/web and refresh the repository profile or reassess to populate new hints. Existing saved profiles retain their recorded results. No migration, automatic historical rewrite or local Compose rebuild is required. Publication is handled through the main-branch documentation and production image workflows.
