# Security policy

## Report privately

Email **support@lyrisoft.tech** with the subject `Preflyt security report`. Do not file a public issue containing an exploit, credentials, private source, customer data or sensitive evidence. This is the designated private reporting contact; mailbox delivery and response handling must be verified before public launch.

Include the affected Preflyt/Action version, deployment type, expected and actual behavior, impact and minimal reproduction with sanitized evidence. Request a secure transfer method before sending sensitive attachments. Never send live credentials. If a credential was exposed, revoke/rotate it with the relevant provider; deleting a file or rewriting Git history is insufficient.

Maintainers will triage, coordinate a fix and agree on disclosure with the reporter. Do not assume a support SLA or bounty; neither is offered by this policy. Keep reproduction within systems you own or are authorized to test.

## Supported releases

Community public release qualification is pending. Existing development/private releases do not carry a public maintenance or long-term-support commitment. At Community launch, publish the supported version range and upgrade instructions here. Until then, no older release is promised security backports. The latest release label alone is not a certification of security.

The separately released Preflyt Action has its own repository, license and release lifecycle. Include its version in reports involving Actions.

## Operator responsibilities

Protect encryption keys, GitHub credentials and backups; use HTTPS for external integration, documented origin settings and least-privilege access. Review [self-hosting guidance](https://docs.preflytlabs.com/self-hosting/). The bundled Health engine and optional native execution have distinct privilege/isolation boundaries; never give the API/worker the host Docker socket to bypass setup.

Security fixes require review and appropriate verification. Public advisories, credentials, repository/package visibility and releases require maintainer authorization. This document does not enable GitHub private vulnerability reporting or configure any external service.
