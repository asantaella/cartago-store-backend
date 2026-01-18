import {
  type SubscriberConfig,
  type SubscriberArgs,
  OrderService,
} from "@medusajs/medusa";
import InvoiceNumberGeneratorService from "../services/invoice-number-generator";

export default async function handleOrderPlaced({
  data,
  eventName,
  container,
  pluginOptions,
}: SubscriberArgs<Record<string, string>>) {
  try {
    const orderService: OrderService = container.resolve("orderService");
    const invoiceNumberGenerator: InvoiceNumberGeneratorService =
      container.resolve("invoiceNumberGeneratorService");

    // Obtener el pedido con las relaciones necesarias
    const order = await orderService.retrieve(data.id, {
      relations: [
        "items",
        "items.variant",
        "customer",
        "shipping_address",
        "billing_address",
        "discounts",
        "shipping_methods",
        "payments",
      ],
    });

    // console.log(
    //   `[NOTIFICATION] Sending order.placed notification for order ${order.display_id}`
    // );

    // Establecer el número de factura en el pedido
    await invoiceNumberGenerator.setOrderInvoiceNumber(order.id);

    console.log(
      `[NOTIFICATION] Order placed, invoice number set for order ${order.display_id}`
    );
  } catch (error) {
    console.error(
      "[NOTIFICATION] Error processing order placed notification:",
      error
    );
  }
}

export const config: SubscriberConfig = {
  event: OrderService.Events.PLACED,
  context: {
    subscriberId: "order-placed-handler",
  },
};
