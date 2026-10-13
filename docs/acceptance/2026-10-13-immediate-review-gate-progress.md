# Immediate verified review and final-gate progress

## Behavior

A successfully claimed pipeline submission requests automatic PR review after
its COMPLETE state and verification audit are persisted. The request is scoped
to the exact repository, PR, commit, policy hash and assessment. It bypasses only
the one-minute periodic admission cooldown. Normal source consent, access,
repository enablement, current policy, budget limits and duplicate protection
remain in place. Dispatch failure records a safe audit event and leaves verified
results COMPLETE. Periodic dispatch remains a recovery path.

The API exposes a stable gate stage alongside the existing state. Action v2.1.1
logs transitions immediately and repeats an unchanged pending stage every thirty
seconds. Failure messages use known local reasons or numeric HTTP status codes;
raw API responses, provider errors, URLs and credentials are never interpolated.
The fifteen-minute wait and deterministic enforcement are unchanged.

Review execution still depends on the worker's five-second polling tick, queue
load and provider availability. Publication can add further time. Immediate
admission is not a guarantee of immediate execution or publication.

## Release and snippets

Action v2.1.1 was published to GitHub Marketplace on 13 October 2026 at
`f05b72de4b4f80877bea619e520302f3379f6ba4`, before the companion Preflyt push.
The tag's GitHub ref was verified against that commit. The user requested exact
version tags: application workflows, generated snippets, workflow editing skill
and copyable docs use `lyrisoft/preflyt-action@v2.1.1`. The published tag is not
moved when the public README changes. Legacy SHA-based workflows remain readable.

## Local and hosted validation

- 49 API cases passed for completion dispatch, exact admission, gate stages,
  pipeline processing and existing PR review/feedback behavior.
- API type checking and Prisma generation passed.
- After the release/skill update, 51 focused API cases passed.
- After the requested version-tag update, 47 workflow/snippet/skill cases passed.
- Action: 22 offline cases passed; two opt-in real-scanner cases skipped locally.
  Python compilation and whitespace checks passed.
- Hosted Action unit and real pinned-scanner jobs passed at the release commit
  (runs 38444073543 and 38444063044).

Tests cover changed policy/source, disabled reviews, denied source sharing,
missing assessment, lost claims/leases, dispatch failures, stage transitions,
legacy APIs, heartbeat timing and malicious/private diagnostic strings.

Live companion PR timing and final-gate logs will be recorded after push.
Neither source PR is merged by this verification.
