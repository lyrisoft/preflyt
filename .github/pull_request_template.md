## Problem and resulting behavior

Describe the user problem and the resulting behavior. Link the issue/design where applicable.

## Validation

List the checks actually run and their results. State what was not run and why; do not claim CI or release acceptance from source inspection alone.

## Risks and release notes

Describe migrations, compatibility, isolation, external-service requirements and remaining limits. Include sanitized screenshots for UI changes.

Add a reviewed `.changes/a-short-description.json` file describing the feature, improvement, fix or documentation change. Include required upgrade actions and list affected migration/configuration files. Use `upgrade: "none"` when no extra steps are required. See `.changes/README.md`; publishing remains manual and assembles these files automatically.

## Contribution checklist

- [ ] Each commit has my DCO sign-off matching its author (`git commit -s`).
- [ ] I have the right to contribute this code; upstream licenses and notices are preserved.
- [ ] No credentials, private source, customer data or sensitive report artifacts are included.
- [ ] Documentation and relevant regression coverage reflect the change.
- [ ] A change file describes the user-facing result and upgrade requirements, or this PR is internal-only and needs no release entry.
- [ ] Any generated/AI-assisted code has been reviewed and its provenance considered.
