# Event Bus Caveats (v1)

For Medusa v1 with `event-bus-local`:

- `eventName` in handler args may be `undefined`.
- `context.subscriberId` can be overwritten with a random value.

Implications:

- Do not rely on `eventName` for critical branching during local-only testing.
- Validate retry behavior in an environment using Redis Event Module.

Production recommendation:

- Use Redis Event Module for consistent retry semantics and subscriber identity handling.

Reference docs:

- https://docs.medusajs.com/v1/development/events/create-subscriber
