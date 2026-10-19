# Engineering Lead and repository assignment fixes — 19 October 2026

Engineering Lead lacked repository management, skill authoring and standard
authoring permissions. Added those permissions without changing Developer,
approval, publication, provider administration or member management permissions.
Repository discovery and selection still intersect active installation and GitHub
user access. Selection records a grant only for that Engineering Lead and the
selected repository; other assessment evidence remains scoped.

The member editor retained existing grants missing from the current repository
picker, but the API treated every submitted ID as a new assignment. An unavailable
existing grant could therefore block adding an otherwise authorized repository.
The API now validates additions against current access while allowing existing
same-organization grants to be preserved or removed. The editor shows these
unavailable assignments explicitly. Preserving a grant cannot bypass GitHub user
rights, selected/available repository state or active workspace membership.

Verification: 147 affected API integration tests and 10 browser tests passed,
including retained/removable unavailable grants, rejected unauthorized additions,
Engineering Lead selection, unchanged Developer restrictions and tenant isolation.
API/web type checks, affected frontend lint and API production build passed.
No database migration or new configuration is required; recreate application
services to apply the change. Production rollout is separate from local testing.
