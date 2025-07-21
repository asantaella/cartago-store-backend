import {
  type SubscriberConfig,
  type SubscriberArgs,
  OrderService,
} from "@medusajs/medusa";
import ShipmentNotificationService from "../services/shipment-notification";

export default async function handleShipmentCreated({
  data,
  eventName,
  container,
  pluginOptions,
}: SubscriberArgs<Record<string, string>>) {
  try {
    console.log(
      `[NOTIFICATION] Shipment created subscriber triggered for fulfillment ${data.id}`
    );

    //const orderService: OrderService = container.resolve("orderService");
    const shipmentSenderService: ShipmentNotificationService =
      container.resolve("shipmentSenderService");
    const manager = container.resolve("manager");

    // Obtener el fulfillment usando el repository manager
    const fulfillmentRepository = manager.getRepository("Fulfillment");
    const fulfillment = await fulfillmentRepository.findOne({
      where: { id: data.id },
      relations: [
        "order",
        "order.items",
        "order.items.variant",
        "order.items.variant.product",
        "order.customer",
        "order.shipping_address",
        "order.billing_address",
        "order.discounts",
        "order.shipping_methods",
        "order.payments",
        "order.region",
        "order.currency",
        "tracking_links",
      ],
    });

    if (!fulfillment) {
      console.error(`[NOTIFICATION] Fulfillment ${data.id} not found`);
      return;
    }

    console.log(
      `[NOTIFICATION] Sending shipment.created notification for order ${fulfillment.order.display_id}`
    );

    // Enviar la notificación de envío creado con el PDF de la factura
    await shipmentSenderService.sendNotification(
      "shipment.created",
      fulfillment
    );

    console.log(
      `[NOTIFICATION] Successfully processed shipment.created for order ${fulfillment.order.display_id}`
    );
  } catch (error) {
    console.error(
      "[NOTIFICATION] Error processing shipment created notification:",
      error
    );
  }
}

export const config: SubscriberConfig = {
  event: OrderService.Events.SHIPMENT_CREATED,
  context: {
    subscriberId: "shipment-created-handler",
  },
};
