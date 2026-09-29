# Make webhook processing the resilient owner of cart completion and SEPA idempotency

**Status:** accepted

Cart completion and Order creation are backend responsibilities owned by payment webhook processing, including SEPA flows where the customer may leave the browser before payment settles. Client-side confirmation can accelerate observation, but it is never the sole path that creates or completes an Order.

## Decision

The backend webhook completion module will:

- accept a payment event as a durable signal and retry transient failures;
- identify the cart and payment attempt using `cart_id`, PaymentIntent identity, and webhook event identity;
- treat an already-existing Order for the cart as an idempotent success condition;
- serialize competing webhook/client completion attempts with a transaction and lock appropriate to the persistence layer;
- create the Order for a genuine SEPA `processing` event, separately from payment confirmation and payment-succeeded state transitions;
- mark payment as succeeded only after the provider event is confirmed and the local transition succeeds;
- avoid fulfillment side effects and avoid marking an Order paid before payment confirmation;
- deduplicate repeated deliveries by PaymentIntent/event identity and make retries safe.

A client request may observe or request progress, but it must not be required for eventual completion. In particular, a genuine SEPA `processing` event may complete the cart and create the Order immediately because settlement can take days. The Order's payment remains awaiting/pending, and fulfillment and paid transitions wait for a later authoritative `succeeded` event. Card and other non-SEPA `processing` events remain pending and do not complete the cart.

## State boundaries

The implementation must distinguish these facts rather than collapse them into one completion result:

1. the Order exists (including when SEPA processing has created it);
2. payment processing is pending/awaiting settlement;
3. payment is confirmed succeeded;
4. payment failed or was cancelled.

Order creation does not by itself imply payment success. Fulfillment is downstream of confirmed payment and is outside this completion transaction.

## Idempotency and concurrency

The completion path must be safe when a webhook and a client-originated request arrive concurrently. It must check for an existing Order, acquire the transaction/lock before creating or mutating shared payment state, and retry transient database or provider-delivery failures. Replayed events must converge on the same cart/Order outcome without duplicate payments or Orders.

The exact database constraint, lock primitive, retry policy, and event-consumption storage are implementation details to be defined during implementation; this ADR establishes their required behavior, not a new endpoint contract.

## Cross-workspace contract

The frontend change `webhook-owned-cart-completion` in the cartago-store-frontend repository references this ADR. That change defines the frontend as an observer with optional acceleration and bounded polling/fallback. It explicitly records that the current frontend/backend contract does not yet expose every state and recovery guarantee described here; implementation must extend the contract rather than infer success from a PaymentIntent status.

The previously verified frontend change `stripe-webhook-authoritative-checkout` remains historical context and is not reopened. This ADR supersedes its assumption that backend changes are out of scope for the coordinated architecture.

## Consequences

- SEPA checkout can recover when the browser closes or the redirect is interrupted, while settlement remains pending.
- Duplicate webhook deliveries and webhook/client races converge without duplicate Order or payment records.
- The backend owns the durable state machine and can retry independently of browser lifetime.
- Frontend success must be based on an observed backend Order/payment state, not solely on Stripe.js.
- A future implementation must define durable event idempotency and transaction boundaries before changing production completion behavior.
- Existing APIs may need additive status/error fields or a one-attempt observation contract; this ADR does not claim that those fields already exist.
