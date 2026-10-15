# Documentation custom domain

The visible broken site was built for `/preflyt/`, while `docs.preflytlabs.com` serves the documentation at `/`. The current main source already has the root base path; the only recent main documentation workflow failed before deployment, leaving the older artifact published.

The default Docusaurus origin is now `https://docs.preflytlabs.com`, with `/` as its base path. The Pages build explicitly sets both values. Configurable overrides remain available for other installations. README, live marketing links, deployment guidance and `llms.txt` point to the custom domain.

The build now verifies its emitted canonical URL and local CSS/JavaScript references before publication. A stale `/preflyt/` asset prefix cannot pass this check. The local production documentation build, type check, emitted-asset validation and focused workflow regression are verified before commit. Browser verification uses a local production preview; it does not deploy or rerun hosted CI.

These changes are committed locally only. The published site remains on its older artifact until the fixes reach main and the documentation workflow succeeds.
