# Third-party licenses and attribution

Apache-2.0 applies to original Preflyt code and documentation. It does not replace upstream licenses, license texts, copyright notices or terms for bundled tools and assets. Preserve notices when redistributing modified upstream portions.

| Component | Retained evidence |
| --- | --- |
| Modified Shadcn Admin web source | [MIT license](apps/web/LICENSE), [pinned source/import record](docs/vendor/shadcn-admin.md) and its source manifest |
| Inline Tabler icons | [Web third-party notices](apps/web/THIRD_PARTY_NOTICES.md) |
| SARIF schema | [Schema license](apps/api/src/github-events/sarif-schema.LICENSE.md) |
| Azure Pipelines artwork | [Asset license](apps/web/src/features/auth/assets/azure-pipelines.LICENSE.txt) |
| GitHub attestation test fixture | [Fixture license](apps/api/test/fixtures/attestation/LICENSE-gh.txt); test-only material |
| JavaScript dependencies | Exact versions in `pnpm-lock.yaml`; upstream package licenses apply. The [web dependency inventory](docs/vendor/shadcn-admin-dependency-licenses.json) is historical and must be regenerated for a release. |
| Container bases, scanner engines, rules and vulnerability databases | Exact inputs in `deploy/` and `docs/deployment/native-runner/`; see the [scanner license review](docs/operations/scanner-licensing.md) and [retained upstream texts/source index](docs/deployment/native-runner/licenses/SCANNER-SOURCES.md). Corresponding-source/data-provider clearance remains open. Engine licensing does not establish the license of every bundled rule/database. |

This index is not a complete dependency license bundle or a legal clearance. Before public redistribution, produce a versioned inventory and include the full notices required by the actual release artifacts. Review fonts, brand marks and screenshots separately. See [CE-02 in the readiness plan](docs/planning/open-source-readiness.md).

Preflyt and Lyrisoft names/logos identify the project and its origin. The copyright license does not grant endorsement or trademark rights. The separate Preflyt Action retains its own MIT license.

Release builds collect actual installed Node package notices with `scripts/deploy/license-bundle.mjs`. API, migration and scanner runtime outputs include `licenses/third-party-licenses.txt` and a hashed inventory. Web images include their dependency notice bundle in `/usr/share/licenses/preflyt/` and at `/third-party-licenses.txt`. Missing notices remain explicit in `reviewRequired`; the generator does not invent an upstream license or establish legal clearance. See [maintained dependency security patches](docs/operations/dependency-security-patches.md) for modified upstream dependency attribution.
