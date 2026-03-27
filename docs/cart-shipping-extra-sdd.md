# Cart shipping extra (SDD)

## Context

- Feature: `cart-shipping-extra-on-post` middleware that ensures the POST/PATCH cart responses stay consistent when variants specify `shipping_option_price_extra` (IVA-inclusive pricing in Spain).
- Motivation: After applying a shipping method, the cart response must immediately show the correct `shipping_total`, `shipping_tax_total`, and overall `total` without requiring a follow-up GET. Without the middleware, the frontend sees the previous shipping tax stored on the cart (`€1.19` in the reproduction) and the POST response is stale.
- Relevant code: [src/api/middlewares/cart-shipping-extra-on-post.ts](src/api/middlewares/cart-shipping-extra-on-post.ts) orchestrates the sync, and [src/api/middlewares/cart-shipping-extra-on-post.spec.ts](src/api/middlewares/cart-shipping-extra-on-post.spec.ts) validates the expectations.

## Goals & Requirements

### Functional

1. Skip middleware work when the request has no cart ID or is the complete endpoint, to avoid unnecessary work.
2. After the cart mutation, recompute shipping-method prices so the response reflects the same `shipping_extra_total` that was persisted to the shipping method.
3. Rebuild `shipping_total`, `shipping_tax_total`, `item_tax_total`, `tax_total`, and `total` using the latest shipping methods and region tax rate, including IVA for `includes_tax` shipping options.
4. Keep payment session amounts aligned with the recomputed cart total, including after tax-exempt transformations and `cartService.setPaymentSessions` runs.
5. Invalidate the cart cache when shipping extra data changes, so subsequent reads see the updated totals.

### Non-functional

- Keep the middleware lightweight: it only runs after POST/PATCH responses and reuses the manager already provided by Medusa.
- Maintain compatibility with Spanish tax service handling (tax exemption, zeroed tax rate) without duplicating logic.
- Preserve relations that the response already attached (e.g., `shipping_option`) while merging prices from the synced shipping methods.

### Constraints

- The middleware must run in the same transaction scope that cart mutations have already completed; it uses `resolveManager(req)` and `manager.transaction(...)`.
- If resolution or request context fails (missing manager, services), the middleware logs errors but allows the response to proceed unchanged.

## Data Flow & Components

1. **Response hijacking**: `adjustCartShippingExtraOnPost` overrides `res.json`, deferring to `hydrateCartWithShippingExtraResponse` and logging errors without throwing.
2. **Cart hydration**: `hydrateCartWithShippingExtraResponse` extracts the cart payload (or nested draft order cart), resolves the manager, and calls `syncShippingExtraAfterMutation` to load the persisted cart via `loadCartWithRelations` (items, variants, shipping methods, addresses, region).
3. **Shipping extra sync**: `syncShippingExtraAfterMutation` calculates the canonical extra (`calculateShippingExtra`) and updates each shipping method price/data if the stored `shipping_extra_total` diverges, saving the change through the repository.
4. **Merging response**: `mergeSyncedShippingMethodsIntoCart` overlays the synced method's price and data back onto the response, keeping additional relations that the client already received intact.
5. **Totals recalculation**: If Spanish tax service marks the cart as tax-exempt, `applyTaxExemptTransformations` runs; otherwise, `applyShippingTotalsToCart` recalculates the shipping subtotal, tax, and total per method (respecting `includes_tax`) before recomputing cart totals and payment-session amounts.
6. **Payment session sync**: `syncPaymentSessionAmountsWithCartTotal` immediately updates any payment session amounts, and `cartService.setPaymentSessions` runs when `syncPaymentSessions` is true to ensure downstream payment records match the new total, followed by another cache invalidation.

## Tax & Pricing Details

- `applyShippingTotalsToCart` derives `subtotal`, `tax_total`, and `total` for each shipping method by checking `includes_tax`. For tax-inclusive methods, it divides the price by `(1 + tax_rate)` and treats the remainder as tax; otherwise, it trusts the stored `tax_total`.
- Shipping tax totals accumulate into `cart.shipping_tax_total`, and `cart.tax_total` becomes `item_tax_total + shipping_tax_total - gift_card_tax_total`, ensuring IVA is not double-counted.
- `cart.total` sums `subtotal + shipping_total + tax_total - discount_total - gift_card_total`, and payment sessions are immediately adjusted to this total.

## Cache & Side Effects

- `invalidateCartCache` (via `cacheService`) runs whenever shipping extra sync executes, twice if payment sessions are refreshed, to keep subsequent GET/checkout flows consistent.
- The middleware logs both successes and failures, but never halts the response flow: failures simply leave the original `body` untouched, avoiding API regressions.

## Error Handling

- Missing manager or cart ID short-circuits the middleware; it logs the issue and proceeds to the next handler.
- Any async error during sync, tax recalculation, or cache invalidation is logged through `logError` and returns the original body to the client.
- Payment-session syncing is wrapped in `try/catch` to prevent failed payments from blocking the response while still logging the failure.

## Deployment Notes & Risks

1. **Spanish tax compliance**: Ensure the Spanish tax service resolvers stay aligned; future rules may change what data needs recalculating.
2. **Cache invalidation**: Reliant on `cacheService.invalidate`; if the cache key scheme changes (`cart_{id}`), middleware must update accordingly.
3. **Concurrency**: Since the middleware reuses the transaction manager, concurrent POSTs may still race; locking remains the responsibility of the cart service.
4. **Payment sessions**: `cartService.setPaymentSessions` may retry with external providers; failures should continue to be logged but cannot block the response.

## Next Steps

1. Observe actual checkout requests to confirm the frontend now sees `total` €526.99 immediately after shipping selection.
2. Monitor logs for repeated cache invalidation or failed payment-session syncs; they may hint at stale data elsewhere.
3. If new countries require similar IVA adjustments, extend the middleware to use region-specific tax-rate metadata rather than assuming Spanish defaults.
