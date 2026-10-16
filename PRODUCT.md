# Preflyt Product

## Register

product

## Users

Developers, engineering managers, platform/DevOps and security engineers working with connected GitHub repositories. CTOs, VPs of Engineering and platform/infrastructure leaders are the intended buyers. Initial customer focus is teams of roughly 10–100 developers in fintech, payments, lending, insurance technology and regulated software; this is a targeting strategy, not a compliance certification claim.

## Product Purpose

Preflyt is a self-hosted Engineering Assurance & Readiness Platform that assesses repository health and verifies CI evidence against approved engineering standards, giving teams a traceable readiness result for each assessed change. Identify risks early, verify approved requirements and provide auditable readiness evidence across repositories. AI supports investigation and recommendations; deterministic checks own readiness evaluation, and GitHub enforces explicitly configured merge rules. Missing or untrusted required evidence remains incomplete. Continuous feedback depends on configured assessments and CI integration.

Tagline: Engineering confidence before production.

Website headline: Know what passed. See what needs attention.

Public descriptor: Engineering assurance for GitHub. After public release clearance: Open-source engineering assurance for GitHub.

Community Edition is free and self-hosted under Apache-2.0, without an artificial repository cap. Managed Cloud is planned for later. Public source/image access and release qualification are still pending; do not imply an available hosted service or anonymous installation.

Planned repository-aware AI reviews (issue #97 / P4.RI), including searchable repository indexing and outside-diff code retrieval, are Cloud-only and belong in separate private Cloud code. Community retains its existing profiles, Health/source evidence and optional BYOK diff reviews.

Canonical positioning: [Product positioning](docs/product/product-positioning.md).

## Brand Personality

Precise, calm and approachable. Use developer-friendly language and useful defaults that reduce setup decisions.

## Anti-references

Avoid bland identical cards, oversized button text, crowded forms, ambiguous badges, fabricated metrics and decorative dashboards. Keep the imported Shadcn Admin foundation.

## Design Principles

- Make the next action clear and keep recovery paths reachable.
- Reuse shared headers, cards, controls and semantic status colors.
- Show current evidence and explain unavailable or incomplete results honestly.
- Preserve organization boundaries, permissions and existing authentication contracts.
- Keep visual hierarchy compact and interactions predictable.

## Accessibility & Inclusion

WCAG AA contrast targets, keyboard navigation, visible focus, readable 320px layouts and complete reduced-motion states are required.

Canonical requirements: [MVP Product Experience](docs/product/mvp-product-experience.md), [Enterprise UI Guidelines](docs/design/enterprise-ui-guidelines.md) and [Implementation Guardrails](docs/agents/product-implementation-guardrails.md).
