# Public Preflyt Action

The public integration is hosted at https://github.com/lyrisoft/preflyt-action. Version v1.0.0 pins commit d80243bae90cc85eaaca08a60e8efd15a413d35a. The Action is MIT licensed; that grant covers only `actions/policy-check` and the exported public Action repository, not the Preflyt application.

Generated policy/standard snippets use the immutable release SHA. Built-in recipes resolve from the installed Action using `preflyt-recipe`, so repositories do not need runtime files. Custom commands and existing reports stay supported. Existing local Action steps remain readable; adding checks upgrades their Action reference and built-in recipe paths.

A setup PR contains exactly two workflow files: the reviewed checks workflow and `.github/workflows/preflyt-gate.yml`. It preserves the base tree and validates the reviewed branch SHA before writing a separate branch. The publication gate uses the same Action with `mode: gate`; it requires no checkout and never runs PR code. Workflow downloads include only these workflows. Copy-and-paste setup needs the separate publication gate committed to the default branch.

## Release procedure

1. Run the Python unit tests and compile checks in `actions/policy-check`.
2. Export the fixed allowlist with `node scripts/actions/package.mjs <empty-directory>`. Never copy application files, credentials or private Git history.
3. Copy the standalone Action CI workflow from the public repository and run it on GitHub before tagging a new release. Keep public and application Action sources identical.
4. Publish a new versioned release in the public repository. Never move a published version tag. Generated snippets pin the resulting commit in `pipeline-action.ts`.
5. Update the workflow-editing skill and increment its version when its instructions change.
6. Publish the GitHub Marketplace release from GitHub's release editor. Organization agreement acceptance is required by GitHub.
7. Test the published check and gate modes against an acceptance PR, automatic verification, PR feedback, configured AI review and existing merge protection.

Normal GitHub verification does not require report signatures. Stronger signed report proofs remain optional. AI feedback remains advisory and uses the user's configured model routes.
