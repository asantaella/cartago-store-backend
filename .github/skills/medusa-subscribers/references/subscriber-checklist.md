# Subscriber Quality Checklist

Use this checklist before considering a subscriber done.

1. File is under `src/subscribers/**` and named by domain + event.
2. Default export is an `async` handler with `SubscriberArgs<TPayload>`.
3. `config` is exported as `SubscriberConfig` and includes:
   - `event` as a string or string array
   - `context.subscriberId` as a stable, readable ID
4. Services are resolved with `container.resolve("...")` only.
5. Needed entities are loaded with explicit relations.
6. Side effects are delegated to services, not embedded as complex logic in the subscriber.
7. Handler uses `try/catch` and logs start/success/error with useful IDs.
8. Idempotency is considered for retries (safe duplicate execution).
9. Official Medusa event names/constants are used.
10. Local event-bus caveats are acknowledged in development testing.
