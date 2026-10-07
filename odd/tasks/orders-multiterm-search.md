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
- [x] **OMS-2 — Use unique Raw parameter names and verify the fix.** Route: same delegated writer. Checks passed: targeted route test (1 test), full Jest suite (31 suites/282 tests), and independent verifier spot-check.

## Progress and evidence

- Authorized by user: apply the search fix.
- Test seam confirmed by user: mocked route GET; inspect generated `Raw` operators without a database.
- Status: OMS-1 and OMS-2 complete.
- Regression test: `src/api/admin/orders/route.spec.ts`.
- RED evidence: `yarn test --runInBand src/api/admin/orders/route.spec.ts` failed at the placeholder uniqueness assertion (expected 8 distinct names, received 1); test setup and module loading passed.
- GREEN and suite evidence: the same targeted command passed (1 test); `yarn test --runInBand` passed (31 suites, 282 tests); the independent verifier repeated both successfully.
- Commit evidence: `338953a` (`feat(orders): implement multi-term customer search with unique SQL parameter bindings`) contains the route fix, regression test, and this task document. The commit appeared during a shared-worktree branch change; the parent did not create it. User chose to preserve it. No push occurred.
- Native review: ASSESS initially returned unassessable due undeclared untracked paths; the risk-gated independent verifier passed. A later START returned an expired consent for an unrelated target, with `lineage_created: false`; no review lineage was created and no mutation occurred.
- Engram mirror status: pending/unavailable; no callable memory tool was exposed.
- Current unrelated shared-worktree changes are in `src/api/admin/customers/route.ts`, `src/api/admin/customers/route.spec.ts`, and `odd/tasks/customer-search-pagination.md`; the other session confirmed it did not switch branches or create the commit and has paused writes.

## Next step

No Orders implementation work remains. Preserve the current commit and unrelated customer pagination changes; do not reset or switch branches.
