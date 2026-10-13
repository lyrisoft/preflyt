# Engineering assurance positioning — 13 October 2026

Applied the approved Engineering Assurance & Readiness Platform category to the homepage, product/capability pages, self-hosting copy, public-page metadata and structured data, documentation landing page, README, PRODUCT.md and PRD. The homepage headline is “Every change. Verified against your standards.” The existing “Engineering confidence before production.” tagline remains in the brand identity.

The positioning guide records the initial customer/buyer focus and the boundaries of verified evidence, configured continuous feedback, supported scanner coverage, advisory AI and explicitly configured GitHub enforcement. Existing capability limits, layout, typography, animations and authentication behavior are preserved. This is a positioning update, not a new capability release or a regulatory compliance claim.

Verification:

- Web production build passed and prerendered the six public routes plus 404 without network access. The docs production build passed with broken-link checking.
- Frontend TypeScript and lint checks passed for the changed files.
- 21 browser tests passed, covering responsive marketing pages and generated-page hydration. The headline assertion handles the intended line break.
- 14 public-build cases passed, including metadata, indexing controls and private-route boundaries.
- Browser inspection verified the running homepage at desktop and 320px widths, product-page copy and the built docs landing page. Temporary viewport overrides were reset.

Hosted PR checks and publication to the deployed website/docs remain separate from this local verification. Neither source changes nor this record imply deployment or PR merge authorization.
