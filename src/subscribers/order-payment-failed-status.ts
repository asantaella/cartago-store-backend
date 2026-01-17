import {
  type SubscriberConfig,
  type SubscriberArgs,
  OrderService,
} from "@medusajs/medusa";
import { subscriberLogger } from "../utils/logger";
import { retryWithBackoff } from "../utils/retry-handler";

interface PaymentFailedData {
  id: string;
  failure_code?: string;
  failure_message?: string;
}

/**
 * Subscriber para el evento custom 'order.payment_failed'.
 *
 * Se ejecuta cuando un pago falla (especialmente pagos SEPA rechazados por el banco).
 * Este evento es emitido por PaymentWebhookService cuando recibe charge.failed de Stripe.
 *
 * Acciones:
 * - Agregar metadata con información del fallo y flag requires_action
 * - Esto permite al frontend mostrar al usuario que se requiere acción
 */
export default async function handleOrderPaymentFailed({
  data,
  eventName,
  container,
}: SubscriberArgs<PaymentFailedData>) {
  const logContext = {
    order_id: data.id,
    failure_code: data.failure_code,
    event: eventName,
    subscriber: "order-payment-failed-handler",
  };

  subscriberLogger.warn(
    logContext,
    "Order payment failed subscriber triggered"
  );

  try {
    const orderService: OrderService = container.resolve("orderService");
    const eventBusService = container.resolve("eventBusService");

    // Actualizar el estado de la orden con metadata del fallo
    try {
      await retryWithBackoff(
        async () => {
          await orderService.update(data.id, {
            metadata: {
              payment_failure_code: data.failure_code,
              payment_failure_message: data.failure_message,
              payment_failed_at: new Date().toISOString(),
              requires_action: true,
            },
          });
        },
        {
          maxRetries: 3,
          delays: [1000, 5000, 15000],
          context: {
            order_id: data.id,
            failure_code: data.failure_code,
            operation: "update_order_failed_status",
          },
          eventBus: eventBusService,
        }
      );

      subscriberLogger.info(
        {
          ...logContext,
        },
        "Order metadata updated with payment failure information"
      );
    } catch (updateError) {
      subscriberLogger.error(
        {
          ...logContext,
          error:
            updateError instanceof Error
              ? updateError.message
              : String(updateError),
        },
        "Failed to update order status after payment failure (after retries)"
      );
      // No relanzar - el error ya está logueado y el evento crítico fue emitido si correspondía
    }
  } catch (error) {
    subscriberLogger.error(
      {
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      },
      "Error in order payment failed subscriber"
    );

    // No relanzar el error para no bloquear otros subscribers
    // El error ya está logueado para debugging
  }
}

export const config: SubscriberConfig = {
  event: "order.payment_failed",
  context: {
    subscriberId: "order-payment-failed-handler",
  },
};
