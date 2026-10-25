# Admin Stock-Zero Alert

## Objective
Notify the administrator when a product variant's `inventory_quantity` transitions from positive to zero.

## Problem and Why
The existing `variant-stock-update` subscriber handles back-in-stock behavior but does not retain a previous inventory quantity. The Medusa update event provides variant identity and changed field names, not the old quantity. The requested alert therefore needs a persisted last-quantity snapshot and an admin email template.

## Scope and Constraints
- Use `ADMIN_EMAIL` as the recipient; if it is missing, log a warning and skip the email without interrupting inventory updates.
- Send one alert for each positive-to-zero transition, including after the variant is restocked.
- Store the last observed `inventory_quantity` in variant metadata and initialize existing variants from their current quantity.
- Use the existing `variant-stock-update` subscriber and email notification infrastructure.
- Email subject includes the variant name; the message includes product/variant name, SKU, optional image, quantity `0`, and a product link.
- Preserve existing back-in-stock notifications and unrelated working-tree changes.
- Known limitation to assess: the event contains no before/after values, so rapid stock changes may be observed after the value has moved again.

## Authorized Scope
- `src/subscribers/variant-stock-update.ts`
- `src/services/product-alert.ts`
- `src/services/product-alert-stock-email-notification.ts`
- `src/templates/emails/stock-zero-alert-admin.handlebars`
- `src/subscribers/__tests__/variant-stock-update.spec.ts`
- `src/services/__tests__/product-alert-stock-email-notification.spec.ts`
- `src/migrations/` (new baseline migration only)

## Checklist
- [ ] **SZA-1 — Implement and verify the stock-zero admin notification**
  - Route: delegated direct. Trigger: behavior spans subscriber, email service/template, and state initialization across multiple non-trivial files.
  - Acceptance: detect positive-to-zero using the metadata snapshot; initialize existing and newly created variants; send the specified admin email with retry behavior; skip with a warning when `ADMIN_EMAIL` is unset; do not regress back-in-stock handling.
  - Verification: focused Jest tests for the subscriber and email notification; TypeScript/build check if available.
- [x] **SZA-2 — Prevent update payloads from overwriting the stock snapshot**
  - Runtime evidence: the approved live-route E2E first ran against the unfixed app and failed as intended: the metadata-only update expected the persisted snapshot to remain `1` but received `0` after submitting stale snapshot metadata. After the service override was added, the same test passed and its `finally` cleanup restored the fixture to its original inventory/snapshot `0/0`. This reproduces the stale-metadata overwrite path; it does not prove the exact production request chain that caused the earlier observed overwrite.
  - Loader investigation: Medusa registers the core API before project API routes (`node_modules/@medusajs/medusa/dist/loaders/index.js:241-259`); the native variant POST is handled by the core product router (`node_modules/@medusajs/medusa/dist/api/routes/admin/products/index.js:56`). Project `src/api/middlewares.ts` is loaded later on its own router, so its registered middleware cannot intercept that native handler.
  - Service seam: Medusa's project loader can replace the core `productVariantService` with `src/services/product-variant.ts`. The override must strip the reserved snapshot key from ordinary client updates while exposing a dedicated trusted snapshot write for the subscriber, so server snapshot persistence remains possible.
  - Newly authorized SZA-2 scope (exactly six paths): `odd/tasks/admin-stock-zero-alert.md`, `src/api/admin/products/variant-stock-snapshot.e2e.spec.ts`, `src/services/product-variant.ts`, `src/subscribers/variant-stock-update.ts`, `src/services/__tests__/product-variant.spec.ts`, and `src/subscribers/__tests__/variant-stock-update.spec.ts`.
  - Route: delegated direct. Trigger: the regression must traverse Medusa's native `admin.products.updateVariant` endpoint, while the fix spans the core service override and the subscriber's trusted snapshot write.
  - Acceptance: after a controlled `0→1` update persists snapshot `1`, a metadata-only update submitting stale snapshot `0` cannot overwrite it; unrelated metadata remains intact. The subscriber can still persist snapshots through its trusted method. Do not change email or back-in-stock behavior.
  - TDD sequencing: Phase 1 added only the live-route SDK E2E regression and this task-doc update; the parent observed RED against the unfixed service and successful cleanup. Phase 2's focused service test was added before implementation and observed RED because `src/services/product-variant.ts` did not yet exist (`Cannot find module '../product-variant'`; zero assertions executed), then GREEN with 3 tests after the service override was added. The subscriber regression was updated to expect the trusted snapshot method before changing the subscriber; it observed RED with 3 failures (expected `updateStockSnapshot`, received no calls) and 6 passing tests, then GREEN with 9 tests after the subscriber called that method. The E2E then passed against the updated running app.
  - E2E setup: use `E2E_STOCK_ZERO_PRODUCT_ID` and `E2E_STOCK_ZERO_VARIANT_ID` from the test environment; load only `MEDUSA_API_KEY` from `.env.local` with dotenv; skip when fixture IDs or auth are absent. The test restores original inventory and metadata in `finally`; Medusa's empty-string metadata deletion removes its temporary unrelated-metadata probe. Restoring original quantity zero after the successful 0→1 sequence is a real 1→0 transition and can send one admin alert.
  - Verification: parent-run E2E RED expected snapshot `1` but received `0`; the post-fix E2E passed (1 test) and cleanup restored `0/0`. Service-test RED was followed by GREEN (3 tests passed); subscriber-test RED (3 expected-method failures, 6 passed) was followed by GREEN (9 passed). `npx tsc -p tsconfig.json --noEmit` and `git diff --check` passed; the parent reran the service test successfully (3 tests). Port `9000` returned `EADDRINUSE` without a reachable listener, so the local E2E server ran on `9001` and was stopped afterward. No inbox receipt was verified; keep SZA-1 incomplete.
  - Known limitations: raw request payload evidence was not captured; the subscriber's independent 100 ms delayed current-state read can still miss fast successive stock transitions.
  - Engram task mirror: pending because no authoritative session ID is available.
  - Prior checks: 44 payload tests, 9 subscriber tests, TypeScript, and diff checks passed before this runtime regression was observed. Clone-local RDD is disabled; the required risk assessment returned high/unassessable because untracked files lacked an explicit inventory; no native review was run.

## Delivery
- Forecast: approximately 350 authored changed lines for the initial notification capability, excluding generated files; the follow-up SZA-2 route/service protection is an additional approximately 440-line coherent slice.
- Strategy: `ask-on-risk` (default); reassess if the forecast or committed total exceeds approximately 400 authored lines.
- Current authored change count: approximately 1,170 lines including this task document and SZA-2 (estimate; generated files excluded).
- Chain strategy: `feature-branch-chain` (user selected after the feature diff exceeded the approximately 400-line budget).
- Planned local review slices:
  1. Email capability: `src/services/product-alert-stock-email-notification.ts`, `src/services/product-alert.ts`, `src/templates/emails/stock-zero-alert-admin.handlebars`, and `src/services/__tests__/product-alert-stock-email-notification.spec.ts` (approximately 177 changed lines; child PR 1 would target the feature tracker branch).
  2. Transition wiring: `src/subscribers/variant-stock-update.ts`, `src/subscribers/__tests__/variant-stock-update.spec.ts`, the baseline migration, and this task document (approximately 359 changed lines; child PR 2 would target child PR 1).
  3. Protect the snapshot from stale admin metadata: `src/api/middlewares.ts`, `src/api/middlewares/product-variant-payload.ts`, and `src/api/middlewares/product-variant-payload.spec.ts` (commit `a9f0a5d`; child PR 3 would target child PR 2).
  4. Prevent native admin updates from overwriting the snapshot: `src/api/admin/products/variant-stock-snapshot.e2e.spec.ts`, `src/services/product-variant.ts`, `src/subscribers/variant-stock-update.ts`, `src/services/__tests__/product-variant.spec.ts`, `src/subscribers/__tests__/variant-stock-update.spec.ts`, and this task document (six approved paths; approximately 440 changed lines). Keep this small overage as one work unit because the live-route regression, trusted snapshot writer, subscriber wiring, and their tests prove one behavior and should not be split by file type.
- Remote tracker/PR creation and pushes are not authorized; these are local commit slices only until separately authorized.
- Branch: `feature/notifications-stock-0`.
- Engram recovery mirror: pending; the runtime supplied no authoritative session identity, so no attributed memory write is permitted.
- Slice 1 commit: `7d21146` (`feat(notifications): add stock-zero admin email`). RDD assessment: `medium`, `review_due=false`, `under_budget`; keep base boundary `bf8dfe9` for the next slice assessment.

## Progress and Evidence
- The unrelated staged change `scripts/payments/stripe-listen-local.mjs` remains staged and is excluded from the feature commits.
- Email capability slice committed as `7d21146`; no review ceremony was due yet because the medium candidate remained under the line budget.
- Transition wiring slice committed as `f6c0958`.
- Snapshot protection and diagnostic logging committed as `a9f0a5d` (`fix(notifications): preserve stock snapshot metadata`).
- Focused Jest: 2 suites passed, 8 tests passed. Parent spot-check rerun passed.
- TypeScript: `npx tsc -p tsconfig.json --noEmit` passed.
- `git diff --check` passed before staging.
- SZA-2 payload tests: 44 passed; subscriber tests: 9 passed; TypeScript and diff checks passed. Independent verification and parent spot-check passed.
- SZA-2 Phase 2 service override tests: 3 passed; subscriber tests: 9 passed; TypeScript and `git diff --check` passed. Parent E2E GREEN passed; the bounded work-unit commit remains pending.
- Clone-local RDD was disabled at the user's request. Risk assessment was unassessable because its temporary index could not be written under `.git`; no review receipt is claimed.

## Next Step
Create the bounded SZA-2 work-unit commit and record its identity. Keep SZA-1 incomplete until inbox receipt is verified; this run did not confirm inbox delivery. Preserve the `feature-branch-chain` strategy; remote PRs and pushes remain pending explicit authorization.
