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
  - Observed logs: a confirmed diagnostic case was `prior_snapshot=0`, `current_inventory_quantity=0`, `admin_email_configured=true`; an earlier event showed `0→1`, followed by the zero/zero case. The actual request payload was not captured, so this is not proof that a submitted stale key caused that production observation.
  - Verified overwrite path: full-product updates pass nested variant objects to `productVariantService.update`; Medusa metadata merging lets a supplied key override the current stored value. This makes a stale `stock_zero_alert_last_inventory_quantity` in submitted metadata a reproducible overwrite path.
  - Route: delegated direct. Trigger: both individual variant updates and full-product nested variant updates must be sanitized, route registration must cover the full-product update endpoint, and both payload shapes require focused regression tests.
  - Authorized scope: `src/api/middlewares.ts`, `src/api/middlewares/product-variant-payload.ts`, and `src/api/middlewares/product-variant-payload.spec.ts`.
  - Acceptance: strip only `stock_zero_alert_last_inventory_quantity` from incoming variant metadata on individual POST/PATCH and full-product update POST paths; preserve all unrelated metadata; do not affect product creation, subscriber/email behavior, or migration state.
  - Verification: `npm test -- --runInBand src/api/middlewares/product-variant-payload.spec.ts`; `npm test -- --runInBand src/subscribers/__tests__/variant-stock-update.spec.ts`; `npx tsc -p tsconfig.json --noEmit`; `git diff --check`.
  - Outcome: regression tests passed (44 payload tests, 9 subscriber tests); TypeScript and diff checks passed. Independent verification and parent spot-check passed. The risk assessment was unassessable because its temporary index could not be written under `.git`; no native review was run with clone-local RDD disabled.
  - Independent limitation: the subscriber's existing 100 ms delayed current-state read can still miss fast successive stock transitions.
  - Engram task mirror: pending because no authoritative session ID is available.

## Delivery
- Forecast: approximately 350 authored changed lines, excluding generated files.
- Strategy: `ask-on-risk` (default); reassess if the forecast or committed total exceeds approximately 400 authored lines.
- Current authored change count: approximately 536 lines including this task document (491 implementation/test lines plus the task artifact).
- Chain strategy: `feature-branch-chain` (user selected after the feature diff exceeded the approximately 400-line budget).
- Planned local review slices, each below 400 changed lines:
  1. Email capability: `src/services/product-alert-stock-email-notification.ts`, `src/services/product-alert.ts`, `src/templates/emails/stock-zero-alert-admin.handlebars`, and `src/services/__tests__/product-alert-stock-email-notification.spec.ts` (approximately 177 changed lines; child PR 1 would target the feature tracker branch).
  2. Transition wiring: `src/subscribers/variant-stock-update.ts`, `src/subscribers/__tests__/variant-stock-update.spec.ts`, the baseline migration, and this task document (approximately 359 changed lines; child PR 2 would target child PR 1).
- Remote tracker/PR creation and pushes are not authorized; these are local commit slices only until separately authorized.
- Branch: `feature/notifications-stock-0`.
- Engram recovery mirror: pending; the runtime supplied no authoritative session identity, so no attributed memory write is permitted.
- Slice 1 commit: `7d21146` (`feat(notifications): add stock-zero admin email`). RDD assessment: `medium`, `review_due=false`, `under_budget`; keep base boundary `bf8dfe9` for the next slice assessment.

## Progress and Evidence
- Writer implementation is staged in two review slices; the unrelated staged change `scripts/payments/stripe-listen-local.mjs` remains untouched.
- Email capability slice committed as `7d21146`; no review ceremony was due yet because the medium candidate remained under the line budget.
- Focused Jest: 2 suites passed, 8 tests passed. Parent spot-check rerun passed.
- TypeScript: `npx tsc -p tsconfig.json --noEmit` passed.
- `git diff --check` passed before staging.

## Next Step
Commit SZA-2 as a local work-unit slice and record its identity. Then redeploy/restart and verify the 1→0 event produces the alert; keep SZA-1 incomplete until runtime email delivery is confirmed. Preserve the `feature-branch-chain` strategy; remote PRs and pushes remain pending explicit authorization.
