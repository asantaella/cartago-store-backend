# Customers multi-term name search

## Objective

Make `GET /admin/customers?q=...` find customers when the query contains one or more given names followed by one or more surnames, including compound names and compound surnames.

## Problem and rationale

The route currently searches the whole normalized `q` string independently in `first_name` and `last_name`. For `Pablo Ortuño`, it compares `%pablo ortuno%` to each column separately; neither `Pablo` nor `Ortuño` contains the full phrase. Accent normalization does not split the query or combine fields.

## Scope

- Add ordered `first_name` + `last_name` search alternatives at each whitespace boundary in a multi-word `q`.
- Require both fields to match within each alternative (AND); OR across possible boundaries and existing email/name/phone search alternatives.
- Preserve accent-insensitive matching and existing filters, relations, pagination, ordering, and blacklist behavior.
- Give distinct normalized predicates unique TypeORM parameter names so different split values cannot overwrite one another.
- Use the confirmed route-handler seam with mocked repositories; no database fixture or customer-data inspection.

## Non-goals

- Reversed `surname + given-name` query order.
- Reordering words or matching arbitrary individual tokens across either field.
- Changes to the separate customer-pagination task or its existing uncommitted edits.

## Constraints

- Preserve the existing shared-worktree changes to `src/api/admin/customers/route.ts` and `src/api/admin/customers/route.spec.ts`; preserve `odd/tasks/customer-search-pagination.md` without editing it.
- Do not commit, push, switch branches, reset, or modify unrelated customer-pagination work.
- Engram mirror: pending — no callable memory/Engram tool is available in this session.

## Acceptance criteria

- `q=Pablo Ortuño` generates a conjunctive predicate with `first_name` matching `Pablo` and `last_name` matching `Ortuño`.
- A compound query such as `Pablo José Ortuño García` includes the correct contiguous split (`Pablo José` / `Ortuño García`).
- Each split's first- and last-name values have distinct SQL parameter names.
- Existing single-term, accent, blacklist, pagination, and filter behavior remains passing.

## Tasks

- [x] **CMS-1 — Add and observe RED route regression tests.** Route: delegated writer (two non-trivial source/test files). `yarn test --runInBand src/api/admin/customers/route.spec.ts` produced behavioral RED: both new cases failed because `namePair` was undefined; four existing tests passed, and setup succeeded.
- [x] **CMS-2 — Add ordered compound-name split predicates with unique parameters.** Route: same delegated writer. `yarn test --runInBand src/api/admin/customers/route.spec.ts` passed (1 suite, 6 tests), including both new cases and existing pagination/blacklist coverage.
- [ ] **CMS-3 — Verify the fix and complete the native review path.** Route: separate verifier after writer. Checks: focused route test, applicable full Jest suite, parent review of the bounded diff, and native review if the configured reviewer is available.

## Progress and evidence

- Authorized by user: implement multi-word matching in `first_name` then `last_name` order, including compound names and surnames.
- Existing shared-worktree pagination edits were inspected and will be preserved; the other session confirmed writes are paused.
- Test seam: direct GET route invocation with mocked repositories and inspection of the TypeORM `where` conditions.
- Initial status: CMS-1 and CMS-2 complete; independent verification and parent diff review passed; native review remains blocked in CMS-3.
- Regression coverage: `src/api/admin/customers/route.spec.ts`, including two-token and compound-name/compound-surname cases.
- RED evidence: targeted test command failed only on the two new missing-name-pair assertions; four existing tests passed and setup/module loading succeeded.
- GREEN evidence: writer's `yarn test --runInBand src/api/admin/customers/route.spec.ts` passed (1 suite, 6 tests).
- Independent verification: the same focused test passed (1 suite, 6 tests); `yarn test --runInBand` passed (31 suites, 285 tests). Parent read the bounded diff and confirmed the existing pagination import/test remain present.
- Risk assessment: native ASSESS returned `unassessable` because untracked documents were not declared; the risk-gated independent verification above passed.
- Native review: medium tier, `review-reliability` lens. The user authorized one forecasted reviewer run. Pi host relay then failed before execution with `reviewer-config-invalid`: no model is configured for `review-reliability`. `mutation_performed` was false; fresh bound STATUS reoffered the same slot. No verdict or approval was produced, and no retry was submitted. Resume only after a reviewer model is configured, using fresh bound STATUS.
- Delivery: leave changes uncommitted unless separately authorized; no push or commit occurred for this task.
- Engram mirror status: pending/unavailable; no callable memory/Engram tool was exposed.
- Existing customer-pagination task/document and its uncommitted edits were preserved.

## Next step

Configure a model for `review-reliability` if native review is desired, then continue only from fresh bound STATUS. The implementation and functional tests are complete; the native review remains pending.
