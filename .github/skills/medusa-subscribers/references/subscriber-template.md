# Subscriber Template (Medusa v1.20.11)

Use this template when creating a new subscriber in `src/subscribers/**`.

```ts
import {
  type SubscriberConfig,
  type SubscriberArgs,
  OrderService,
} from "@medusajs/medusa";

// Replace with the exact payload from the event reference
type EventPayload = Record<string, string>;

export default async function mySubscriberHandler({
  data,
  eventName,
  container,
  pluginOptions,
}: SubscriberArgs<EventPayload>) {
  try {
    const domainService = container.resolve("domainService");

    // Retrieve entities and delegate heavy logic to services
    await domainService.handleEvent({ data, eventName, pluginOptions });

    console.log(`[SUBSCRIBER] Processed ${eventName ?? "unknown_event"}`);
  } catch (error) {
    console.error("[SUBSCRIBER] Error while handling event:", error);
  }
}

export const config: SubscriberConfig = {
  event: OrderService.Events.SHIPMENT_CREATED,
  context: {
    subscriberId: "my-subscriber-handler",
  },
};
```

## Notes

- Prefer service event constants over string literals.
- Keep the handler orchestration-focused; move business rules to `src/services/**`.
- If multiple events are handled, use `event: [event1, event2]` and branch with `eventName`.
