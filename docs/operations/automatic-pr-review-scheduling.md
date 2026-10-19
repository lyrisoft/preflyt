# Automatic PR review scheduling

Automatic AI review admission is bound to the organization, repository, pull request and head commit. Changing the default model, a stage override, provider credentials, review skills, policy or repository review settings does not automatically repeat an existing attempt for that PR head. This includes completed, unavailable, queued, running and cancelled attempts.

The dispatcher checks saved reviews through their original assessment and PR number before reading source or scheduling inference. This also recognizes historic records whose automatic keys included model configuration. No migration or rewriting of saved reviews is required. A stable per-batch key provides duplicate admission protection for new work, without including model-route revisions or base-branch changes.

New PR head commits remain eligible under existing permissions, published policy, source-sharing consent and verified-pipeline requirements. Explicit user review requests and retries remain separate from background scheduling and may use the current tested model. A configuration change still invalidates queued work pinned to outdated settings; it does not silently switch that work to another model or launch a replacement.

GitHub publication continues to use the original PR and commit, current authorization checks, verified comment receipts and the existing publication flags. This change does not delete prior comments, change automatic-review preferences, or send a real GitHub comment during tests.

Regression coverage checks stage/default model changes, default inheritance, legacy keys, unavailable attempts, explicit retries, per-PR/repository isolation and new head commits. Deployment verification must confirm that polling unchanged PRs does not create additional review jobs or publications.
