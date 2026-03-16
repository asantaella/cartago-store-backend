import {
  type SubscriberArgs,
  type SubscriberConfig,
  OrderService,
} from "@medusajs/medusa";
import PlaceOrderEmailNotificationService from "../services/place-order-email-notification";

type OrderPlacedPayload = {
  id: string;
};

const SEPA_PROCESSING_CONFIRMATION_WAIT_MS = 60_000;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export default async function handleOrderPlacedSepa({
  data,
  container,
}: SubscriberArgs<OrderPlacedPayload>) {
  try {
    const orderService: OrderService = container.resolve("orderService");
    const placeOrderEmailNotificationService: PlaceOrderEmailNotificationService =
      container.resolve("placeOrderEmailNotificationService");

    await wait(SEPA_PROCESSING_CONFIRMATION_WAIT_MS);

    const order = await orderService.retrieveWithTotals(data.id, {
      relations: [
        "items",
        "items.tax_lines",
        "items.variant",
        "items.variant.product",
        "customer",
        "shipping_address",
        "billing_address",
        "discounts",
        "shipping_methods",
        "shipping_methods.shipping_option",
        "shipping_methods.tax_lines",
        "payments",
        "gift_cards",
        "region",
        "currency",
      ],
    });

    if (
      !placeOrderEmailNotificationService.isSepaDirectDebitOrderProcessing(
        order,
      )
    ) {
      console.log(
        `[NOTIFICATION][ORDER_PLACED_SEPA] Skipping order ${order.display_id}: payment is not Stripe SEPA Direct Debit in processing status after 60 seconds`,
      );
      return;
    }

    await placeOrderEmailNotificationService.sendNotification(
      OrderService.Events.PLACED,
      order,
    );

    console.log(
      `[NOTIFICATION][ORDER_PLACED_SEPA] Successfully processed order.placed for order ${order.display_id}`,
    );
  } catch (error) {
    console.error(
      "[NOTIFICATION][ORDER_PLACED_SEPA] Error processing order.placed notification:",
      error,
    );
  }
}

export const config: SubscriberConfig = {
  event: OrderService.Events.PLACED,
  context: {
    subscriberId: "order-placed-sepa-handler",
  },
};
