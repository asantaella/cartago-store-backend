import {
  type SubscriberConfig,
  type SubscriberArgs,
  OrderService,
  PaymentStatus,
  FulfillmentStatus,
} from "@medusajs/medusa";
import InvoiceNumberGeneratorService from "../services/invoice-number-generator";
import ShipmentNotificationService from "../services/shipment-notification";
import PlaceOrderEmailNotificationService from "../services/place-order-email-notification";
import ReceiptNotificationService from "../services/receipt-notification";

export default async function handleOrderPlaced({
  data,
  eventName,
  container,
  pluginOptions,
}: SubscriberArgs<Record<string, string>>) {
  try {
    // console.log(
    //   `[NOTIFICATION] Order placed subscriber triggered for order ${data.id}`
    // );

    const orderService: OrderService = container.resolve("orderService");
    const receiptNotificationService: ReceiptNotificationService =
      container.resolve("receiptNotificationService");
    const shipmentNotificationService: ShipmentNotificationService =
      container.resolve("shipmentNotificationService");
    const placeOrderEmailNotificationService: PlaceOrderEmailNotificationService =
      container.resolve("placeOrderEmailNotificationService");
    const invoiceNumberGenerator: InvoiceNumberGeneratorService =
      container.resolve("invoiceNumberGeneratorService");

    // Obtener el pedido con las relaciones necesarias
    const order = await orderService.retrieveWithTotals(data.id, {
      relations: [
        "items",
        "items.variant",
        "customer",
        "shipping_address",
        "billing_address",
        "discounts",
        "shipping_methods",
        "shipping_methods.shipping_option",
        "payments",
        "gift_cards",
      ],
    });

    // console.log(
    //   `[NOTIFICATION] Sending order.placed notification for order ${order.display_id}`
    // );

    // Establecer el número de factura en el pedido
    await invoiceNumberGenerator.setOrderInvoiceNumber(order.id);

    if (order.fulfillment_status === FulfillmentStatus.SHIPPED) {
      await shipmentNotificationService.sendInvoiceNotification(order, {
        showTrackingDeliverySection: false,
      });

      console.log(
        `[NOTIFICATION] Successfully processed SEPA invoice-created notification for order ${order.display_id}`,
      );

      return;
    }

    // Enviar la notificación en el evento de pago capturado
    await receiptNotificationService.sendNotification(
      OrderService.Events.PAYMENT_CAPTURED,
      order,
    );

    console.log(
      `[NOTIFICATION] Successfully processed order.payment_captured for order ${order.display_id}`,
    );

    console.log(
      `[NOTIFICATION][ADMIN] Successfully processed order.payment_captured for order ${order.display_id}`,
    );
  } catch (error) {
    console.error(
      "[NOTIFICATION] Error processing order placed notification:",
      error,
    );
  }
}

export const config: SubscriberConfig = {
  event: OrderService.Events.PAYMENT_CAPTURED,
  context: {
    subscriberId: "order-payment-captured-handler",
  },
};
