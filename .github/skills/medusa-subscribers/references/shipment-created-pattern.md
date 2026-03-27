# Pattern: shipment.created Notification

Reference implementation in this repository:

- `src/subscribers/shipment-created.ts`

## Flow

1. Resolve `shipmentNotificationService` from DI.
2. Resolve `manager` and retrieve fulfillment by `data.fulfillment_id`.
3. Load `order` + required relations for downstream templates and notifications.
4. Exit early when fulfillment is missing.
5. Call:

```ts
await shipmentNotificationService.sendNotification(
  OrderService.Events.SHIPMENT_CREATED,
  fulfillment,
);
```

6. Log success with `fulfillment.order.display_id`.

## Required relations for current implementation

- `order`
- `order.items`
- `order.items.variant`
- `order.items.variant.product`
- `order.customer`
- `order.shipping_address`
- `order.billing_address`
- `order.discounts`
- `order.shipping_methods`
- `order.payments`
- `order.region`
- `order.currency`

## Why this pattern

- Notification services generally need rich order context.
- Keeping relation loading explicit avoids hidden lazy-loading assumptions.
- Calling `sendNotification` with the official event constant keeps behavior aligned with Medusa event semantics.
