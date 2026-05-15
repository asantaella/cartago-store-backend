import {
  type SubscriberConfig,
  type SubscriberArgs,
  OrderService,
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
    const orderService: OrderService = container.resolve("orderService");
    const invoiceNumberGeneratorService: InvoiceNumberGeneratorService =
      container.resolve("invoiceNumberGeneratorService");
    const receiptNotificationService: ReceiptNotificationService =
      container.resolve("receiptNotificationService");
    const shipmentNotificationService: ShipmentNotificationService =
      container.resolve("shipmentNotificationService");
    const placeOrderEmailNotificationService: PlaceOrderEmailNotificationService =
      container.resolve("placeOrderEmailNotificationService");

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

    // Asignar número de factura al capturar el pago. El envío reutiliza el
    // mismo valor ya persistido en metadata.
    if (!order.metadata?.invoice_number) {
      await invoiceNumberGeneratorService.setOrderInvoiceNumber(order.id);
    }

    if (order.fulfillment_status === FulfillmentStatus.SHIPPED) {
      await shipmentNotificationService.sendInvoiceNotification(order, {
        showTrackingDeliverySection: false,
      });

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
