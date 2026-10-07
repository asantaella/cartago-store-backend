# Orders multi-term customer search

## Objective

Ensure a multi-word customer-name search in `GET /admin/orders` does not broaden to orders matching only the surname because TypeORM Raw predicates share a SQL parameter key.

## Problem and rationale

`normalizedILike()` in `src/api/admin/orders/route.ts` names every raw bind `:nval`. A multi-term search creates multiple predicates with different values; TypeORM's shared parameter map lets later values overwrite earlier ones. Searching `Pablo Ortuño` can therefore degrade to a surname-only match such as `Sergio Ortuño`.

## Scope

- Add route-level regression coverage at the confirmed seam: invoke `GET` with mocked repositories and inspect the generated TypeORM Raw operators for distinct bindings and preserved per-predicate values.
- Give normalized search predicates unique SQL parameter names.
- Keep existing accent-insensitive, whitespace-insensitive matching and all non-search order behavior unchanged.

## Constraints

- No database fixture is required; the user confirmed the route-test seam.
- Do not modify or inspect the supplied local order record or expose customer data.
- Do not commit or publish; the user requested applying the code changes, not delivery.
- Engram mirror: pending — no callable memory/Engram tool is available in this session.

## Acceptance criteria

- A multi-word search produces independently bound normalized-name values; no distinct predicate values overwrite each other through a shared placeholder.
- The regression test fails before the fix and passes after it.
- Existing order search behavior remains covered by focused checks.

## Tasks

- [x] **OMS-1 — Add and observe the failing multi-word search regression test.** Route: delegated writer (multi-file implementation trigger). Check: `yarn test --runInBand src/api/admin/orders/route.spec.ts` reached the intended assertion and failed behaviorally: expected 8 distinct placeholder names, received 1 (`nval`).
- [ ] **OMS-2 — Use unique Raw parameter names and verify the fix.** Route: same delegated writer. Checks: targeted route test GREEN; applicable full Jest suite; parent spot-check of the targeted test.

## Progress and evidence

- Authorized by user: apply the search fix.
- Test seam confirmed by user: mocked route GET; inspect generated `Raw` operators without a database.
- Initial status: OMS-1 completed with observed behavioral RED; OMS-2 in progress.
- Regression test: `src/api/admin/orders/route.spec.ts`.
- RED evidence: `yarn test --runInBand src/api/admin/orders/route.spec.ts` failed at the placeholder uniqueness assertion (expected 8 distinct names, received 1); test setup and module loading passed.
- Verification evidence: production fix and GREEN/full-suite checks pending.
- Delivery: leave changes uncommitted unless separately authorized.
- Engram mirror status: pending/unavailable; no callable memory tool was exposed.

## Next step

Continue the same delegated writer for OMS-2: give each normalized Raw predicate a unique SQL parameter name, then run targeted and applicable full checks.
