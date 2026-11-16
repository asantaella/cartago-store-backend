# Backend NIF/CIF completion guard

Branch: `feature/backend-nif-cif-completion-guard` (from `master` @ `7364ed7`)
Delivery strategy: `ask-on-risk` — forecast ~250 authored changed lines (single PR expected).

## Objective

Prevent the backend from completing a cart into an order when the cart is EUR, its
`total >= 40000` minor units (€400), and neither `shipping_address.metadata.nif_cif`
nor `billing_address.metadata.nif_cif` holds a non-blank string.

## Problem / Why

The rule is enforced only in the storefront (`cartago-store-frontend`,
`feature/cart-nif-validation`, `src/modules/checkout/nif-validation.ts`). Any client
calling `POST /store/carts/:id/complete` directly, or a stale browser cart, bypasses it.
Manual QA already completed a €866.99 cart without NIF (frontend bug fixed in `ed2d988`).
The backend has no equivalent check (verified 2026-11-16: no `nif_cif` validation in
`src/api`, `src/strategies` does not exist).

## Completion paths found

1. `POST /store/carts/:id/complete` → `persistCartPricingOnComplete` middleware
   (`src/api/middlewares.ts:148`) → Medusa `cartCompletionStrategy.complete`.
2. Stripe webhook subscriber `src/subscribers/stripe-webhook-cart-completion.ts:114`
   → `cartCompletionStrategy.complete` (payment already confirmed at Stripe).

Both converge on the `cartCompletionStrategy` registration, so the guard lives there.

## Decision (2026-11-16)

User chose option (c) only: block **before any payment exists**, at payment-session
creation/selection. Options (a) refuse-after-payment and (b) complete-and-flag are discarded.
Consequence: no guard in `cartCompletionStrategy`, the complete endpoint, or the Stripe
webhook — by the time those run (Stripe confirms client-side, PayPal captures before
`completeCart`), the customer has already paid, so rejecting there would be option (a).

## Scope

- Pure predicate `src/utils/nif-cif-requirement.ts` mirroring the frontend predicate
  (currency read from `cart.region.currency_code`, Medusa v1 has no `cart.currency_code`).
- One middleware `src/api/middlewares/nif-cif-on-payment-session.ts` registered in
  `src/api/middlewares.ts` for the payment-session **selection** entry points:
  - `POST /store/carts/:id/payment-session` (Medusa native: select provider)
  - `POST /store/carts/:id/payment-session-context` (custom route, used by the storefront)
  - `POST /store/carts/:id/payment-sessions/:provider_id` (Medusa native: update session data)
  - `POST /store/carts/:id/payment-sessions/:provider_id/refresh` (Medusa native)
- `POST /store/carts/:id/payment-sessions` (create) is deliberately NOT guarded (see T1).
- Error contract: HTTP 400 `{ type: "not_allowed", code: "nif_cif_required" }`, so the
  storefront can map it to the address-step modal.

## Known residual gap

If NIF/CIF is removed from the address after a payment session exists and Medusa does
not refresh sessions on address-only updates, a stale session could still be paid.
T1 verifies whether `cartService.update` refreshes sessions on address change; if not,
T4 decides whether to also guard `POST /store/carts/:id` address updates that clear NIF/CIF
on carts >= €400 (still pre-payment, so consistent with option c).

## Constraints

- Medusa `^1.20.10`; middleware must load the cart with `region`, `shipping_address`,
  `billing_address` and totals (`cartService.retrieveWithTotals`).
- Do not touch `scripts/payments/stripe-listen-local.mjs` (unrelated local change).
- Predicate must stay behaviorally identical to the frontend one.

## Tasks

- [x] **T1** Spike: confirm the exact Medusa v1.20 payment-session routes/methods in
  `node_modules/@medusajs/medusa/dist/api/routes/store/carts/index.js`, how the storefront
  calls them, and whether address updates refresh payment sessions. Route: inline.
  Findings (2026-11-16):
  - Routes (`index.js:167-191`): `POST /:id/payment-sessions`, `POST /:id/payment-sessions/:provider_id`,
    `POST /:id/payment-sessions/:provider_id/refresh`, `POST /:id/payment-session`.
  - Storefront `CheckoutForm` (frontend `checkout-form/index.tsx:53`) calls
    `createPaymentSessions` during server render once address + shipping exist; its wrapper
    (`lib/data/index.ts:1004`) swallows errors and returns `null`, and the page then renders
    `null`. Guarding create would blank the whole checkout and prevent the customer from
    reaching the address step to add the NIF/CIF. Creating sessions moves no money; the
    storefront only pays through the **selected** session (`payment-session-context`).
    So the guard sits on selection, not creation.
  - `POST /store/carts/:id` (`update-cart.js:180-184`) calls `cartService.setPaymentSessions`
    in-process whenever sessions exist, so an address change that clears NIF/CIF keeps the
    selected session alive without passing through the selection middleware. Residual gap
    confirmed → T4.
- [ ] **T2** RED/GREEN predicate `isNifCifMissingForCart` + unit tests (EUR ≥/< 40000,
  non-EUR, blank/whitespace NIF, shipping vs billing, missing region). Route: inline.
- [ ] **T3** RED/GREEN middleware `nif-cif-on-payment-session` + registration for the four
  entry points; rejects with `nif_cif_required` before the route handler, `next()` otherwise.
  Route: delegated writer (middleware + spec + `middlewares.ts`).
- [ ] **T4** Close the residual gap: `POST /store/carts/:id` that leaves a EUR cart >= €400
  without NIF/CIF while a payment session is selected. Approach to confirm: middleware after
  the update clears the selected session (`payment_session` deselect) instead of rejecting the
  address change, so the customer is forced back through selection. Route: delegated writer.
- [ ] **T5** Docs: error contract in `src/api/README.md`; manual check against local backend
  (payment-session creation on a €400+ EUR cart without NIF/CIF → 400).

## Acceptance criteria

- Selecting, updating, or refreshing a payment session on a EUR cart with `total >= 40000`
  and no NIF/CIF fails with `nif_cif_required`; creating sessions still works so checkout renders.
- Compliant carts, carts under €400, and non-EUR carts behave as before.
- Cart completion and the Stripe webhook are unchanged.
- Existing middleware tests still pass.

## Checks

- `npx jest src/utils/__tests__/nif-cif-requirement.spec.ts`
- `npx jest src/api/middlewares/__tests__/nif-cif-on-payment-session.spec.ts`
- `npx jest src/api/middlewares` (regression)
- `npx tsc --noEmit`

## Progress

- 2026-11-16: exploration done, branch created, plan written.
- 2026-11-16: decision — option (c) only; guard moved from completion strategy to
  payment-session entry points.
- 2026-11-16: T1 done — guard moved from session creation to session selection; residual
  gap via `POST /store/carts/:id` confirmed (T4). Next: T2.
