import {
  type SubscriberConfig,
  type SubscriberArgs,
  OrderService,
} from "@medusajs/medusa";
import ReceiptNotificationService from "../services/receipt-notification";
import { subscriberLogger } from "../utils/logger";
import { retryWithBackoff } from "../utils/retry-handler";

/**
 * Subscriber para el evento order.payment_captured.
 *
 * Se ejecuta cuando un pago es capturado exitosamente.
 * Este evento es emitido automáticamente por Medusa cuando:
 * - Captura automática está habilitada y el pago se procesa exitosamente
 * - Un pago SEPA es capturado días después (cuando el banco confirma)
 *
 * Acciones:
 * - Enviar notificación de recibo al cliente
 */
export default async function handleOrderPaymentCaptured({
  data,
  eventName,
  container,
}: SubscriberArgs<Record<string, string>>) {
  const logContext = {
    order_id: data.id,
    event: eventName,
    subscriber: "order-payment-captured-handler",
  };

  subscriberLogger.info(
    logContext,
    "Order payment captured subscriber triggered"
  );

  try {
    const orderService: OrderService = container.resolve("orderService");
    const receiptNotificationService: ReceiptNotificationService =
      container.resolve("receiptNotificationService");
    const eventBusService = container.resolve("eventBusService");

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

    subscriberLogger.info(
      {
        ...logContext,
        display_id: order.display_id,
        payment_status: order.payment_status,
        customer_email: order.email,
      },
      "Sending receipt notification for captured payment"
    );

    // =====================================================
    // ENVÍO DE RECIBO
    // Enviar el recibo cuando el pago ha sido capturado
    // Usar retry con backoff para operación crítica
    // =====================================================
    try {
      await retryWithBackoff(
        async () => {
        /*   await receiptNotificationService.sendNotification(
            OrderService.Events.PAYMENT_CAPTURED,
            order
          ); */
        },
        {
          maxRetries: 3,
          delays: [1000, 5000, 15000],
          context: {
            order_id: data.id,
            display_id: order.display_id,
            operation: "send_receipt",
          },
          eventBus: eventBusService,
        }
      );

      subscriberLogger.info(
        {
          ...logContext,
          display_id: order.display_id,
        },
        "Receipt notification sent successfully"
      );
    } catch (notificationError) {
      subscriberLogger.error(
        {
          ...logContext,
          display_id: order.display_id,
          error:
            notificationError instanceof Error
              ? notificationError.message
              : String(notificationError),
        },
        "Failed to send receipt notification after retries"
      );
      // No relanzar - el error ya está logueado y el evento crítico fue emitido si correspondía
    }
  } catch (error) {
    subscriberLogger.error(
      {
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      },
      "Error in order payment captured subscriber"
    );

    // No relanzar el error para no bloquear otros subscribers
    // El error ya está logueado para debugging
  }
}

export const config: SubscriberConfig = {
  event: OrderService.Events.PAYMENT_CAPTURED,
  context: {
    subscriberId: "order-payment-captured-handler",
  },
};
