# Scanner licensing and redistribution

Preflyt's Apache-2.0 license covers its original code and documentation. Lyrisoft
does not acquire ownership of upstream scanners by using them. Upstream licenses
supply the permissions; their conditions continue to apply to commercial use,
self-hosting, redistribution and any future Cloud offering.

| Component | Terms and Preflyt's obligations |
| --- | --- |
| Gitleaks 8.30.1 | MIT. Commercial use and redistribution are permitted with its copyright/license notice. The CLI and its default rules are distinct from any separately licensed GitHub Action. |
| jscpd 4.3.0 | MIT. Retain its notice and notices for transitive packages. |
| Trivy 0.75.0 | Apache-2.0. Preserve license, notices and change attribution as applicable. Its vulnerability data, checks and base image dependencies need their own inventory; the engine license does not license all data. |
| Semgrep CE 1.179.0 | LGPL-2.1; the installed package metadata declares LGPL-2.1-or-later. Preserve the actual upstream license and comply with corresponding-source/build and recipient modification requirements for the distributed components. Preflyt invokes CE as a separate executable. That separation does not waive redistribution obligations. |
| Semgrep-maintained Registry rules / Pro products | Separate terms. Semgrep's current maintained rule license restricts competing products/SaaS. Do not assume that public rules are licensed under LGPL or Apache. Preflyt invokes checked-in local configurations and does not fetch Registry packs. Their authorship/origin still belongs in the owner rights review. |
| Node, Alpine/Debian, Docker CLI and scanner dependencies | Mixed upstream licenses. Inventory the actual final filesystem and supply notices/source obligations for any LGPL/GPL component. |

Primary sources checked on 16 October 2026:
[Semgrep licensing](https://docs.semgrep.dev/licensing),
[pinned Semgrep license](https://github.com/semgrep/semgrep/blob/fed96460fd67f504ea59342eba8f921f4d74fe17/LICENSE),
[Gitleaks license](https://github.com/gitleaks/gitleaks/blob/v8.30.1/LICENSE),
[Trivy license](https://github.com/aquasecurity/trivy/blob/v0.75.0/LICENSE),
[jscpd license](https://github.com/kucherenko/jscpd/blob/v4.3.0/LICENSE).

## Concrete findings and corrections

The bundled Semgrep archive contained both `semgrep-core` and
`semgrep-core-proprietary`. The corrected Dockerfile removes the unused
proprietary engine and copies the resulting filesystem into a fresh image so
that old layers do not carry it. Registry/native build-cache export uses `min`
for these scanner targets; older caches require separate inspection before any
public visibility change. The CE engine and fixed local-rule behavior are
verified with the existing generated-source fixtures.

Scanner Dockerfiles now retain the upstream texts and source index in
`/usr/share/licenses/preflyt-scanners/`. The source record is
[`SCANNER-SOURCES.md`](../deployment/native-runner/licenses/SCANNER-SOURCES.md).
Node runtime exporters collect complete installed-package license/notice files
and a hash inventory in `licenses/`. Web builds ship a conservative dependency
notice bundle, including build tools, under `/usr/share/licenses/preflyt/` and
as `/third-party-licenses.txt` and `/third-party-inventory.json`.

These changes implement attribution collection; they do not claim all binary
redistribution has legal clearance. Before distribution, retain the exact
platform image/filesystem inventory, database metadata/digest and provider terms,
and required corresponding source/build materials. Resolve packages marked
`reviewRequired` by the notice generator against their actual upstream sources.
Do not replace missing texts with an assumed generic MIT notice.

## Community and Cloud

The permissive scanner licenses allow commercial use subject to their terms.
LGPL itself does not impose an AGPL-style network-source obligation solely from
hosting CE, but distribution, linking and modifications still need analysis.
Do not include Semgrep Pro or restricted Registry packs in Preflyt Cloud without
the appropriate rights. New rule packs, engine versions or data providers require
a fresh review of their own terms. Apache-2.0 on Preflyt does not grant rights
that upstream withheld.
