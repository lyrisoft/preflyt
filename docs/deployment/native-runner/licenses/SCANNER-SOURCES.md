# Bundled scanner source and license record

Recorded 16 October 2026. These licenses apply to upstream components, separately
from Apache-2.0 on original Preflyt wrappers and rule configuration. This file is
an attribution/source index, not a substitute for required corresponding source.

| Component | Version / build input | Source and license |
| --- | --- | --- |
| Semgrep CE | 1.179.0; image `semgrep/semgrep@sha256:93963d9295a366f59e4850127b1550400ee7b388f04fe144e4a1f6325d96e01b` | https://github.com/semgrep/semgrep/tree/fed96460fd67f504ea59342eba8f921f4d74fe17 ; `semgrep-LICENSE` (LGPL-2.1; installed distribution declares LGPL-2.1-or-later) |
| Gitleaks | 8.30.1; image `zricethezav/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f` | https://github.com/gitleaks/gitleaks/tree/v8.30.1 ; `gitleaks-LICENSE` (MIT) |
| Trivy | 0.75.0; image `aquasec/trivy@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa` | https://github.com/aquasecurity/trivy/tree/v0.75.0 ; `trivy-LICENSE`, `trivy-NOTICE` (Apache-2.0) |
| jscpd | 4.3.0; exact dependencies in `duplication/package-lock.json` | https://github.com/kucherenko/jscpd/tree/v4.3.0 ; `jscpd-LICENSE` (MIT) |
| Trivy database builder | Notice reference `cbebf2ecd6df42d36463844a45e689afee51c70f` | https://github.com/aquasecurity/trivy-db/tree/cbebf2ecd6df42d36463844a45e689afee51c70f ; `trivy-db-LICENSE`, `trivy-db-NOTICE` |

The Trivy database is refreshed at build time. Its builder's license is not a
blanket grant for all vendor data. A release must retain the actual database
metadata/digest, provider data sources and their redistribution terms. This
reference does not claim the bundled database was generated at this source commit.

Semgrep is invoked as a separate executable with fixed local configuration under
`/opt/preflyt/config/`, metrics off and no registry rule-pack download. The
upstream image also contains `semgrep-core-proprietary`; Preflyt removes it and
exports a flattened CE filesystem so that it is absent from shipped image layers.
Do not distribute proprietary Semgrep Code or import Semgrep-maintained Registry
rules under Preflyt's license. Review https://docs.semgrep.dev/licensing before
adding any third-party rules or changing Cloud usage.

Before binary redistribution, preserve complete third-party notices and supply
any corresponding source/build material required by LGPL/GPL components in the
actual images, including base-distribution libraries. Source URLs alone do not
prove those obligations fulfilled. Upstream trademarks remain with their owners.
