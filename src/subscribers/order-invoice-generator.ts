import {
  type SubscriberConfig,
  type SubscriberArgs,
  OrderService,
} from "@medusajs/medusa";
import OrderInvoiceService from "../services/order-invoice";

export default async function handleOrderInvoiceGeneration({
  data,
  eventName,
  container,
  pluginOptions,
}: SubscriberArgs<Record<string, string>>) {
  try {
    console.log(
      `[ORDER-INVOICE] Order invoice generation subscriber triggered for order ${data.id}`
    );

    const orderInvoiceService: OrderInvoiceService = container.resolve(
      "orderInvoiceService"
    );

    // Establecer el número de factura en el pedido
    await orderInvoiceService.setOrderInvoiceNumber(data.id);

    console.log(
      `[ORDER-INVOICE] Invoice number successfully set for order ${data.id}`
    );
  } catch (error) {
    console.error(
      `[ORDER-INVOICE] Error setting invoice number for order ${data.id}:`,
      error
    );
  }
}

export const config: SubscriberConfig = {
  event: OrderService.Events.PLACED,
  context: {
    subscriberId: "order-invoice-generator",
  },
};
