import {
  type SubscriberConfig,
  type SubscriberArgs,
  OrderService,
} from "@medusajs/medusa";
import { subscriberLogger } from "../utils/logger";

interface PaymentFailedData {
  id: string;
  failure_code?: string;
  failure_message?: string;
}

/**
 * Subscriber para el evento order.payment_failed (custom).
 *
 * Se ejecuta cuando un pago falla, especialmente útil para:
 * - Pagos SEPA rechazados por el banco (días después del checkout)
 * - Tarjetas rechazadas en captura manual
 *
 * Acciones:
 * 1. Log estructurado del fallo
 * 2. (Opcional) Notificar al cliente sobre el fallo de pago
 *
 * NOTA: El evento "order.payment_failed" es emitido por PaymentWebhookService
 * cuando recibe charge.failed de Stripe.
 */
export default async function handlePaymentFailed({
  data,
  eventName,
  container,
}: SubscriberArgs<PaymentFailedData>) {
  const logContext = {
    order_id: data.id,
    event: eventName,
    subscriber: "payment-failed-handler",
    failure_code: data.failure_code,
    failure_message: data.failure_message,
  };

  subscriberLogger.warn(logContext, "Payment failed subscriber triggered");

  try {
    const orderService: OrderService = container.resolve("orderService");

    // Obtener el pedido con las relaciones necesarias
    const order = await orderService.retrieve(data.id, {
      relations: [
        "items",
        "customer",
        "shipping_address",
        "billing_address",
        "payments",
      ],
    });

    subscriberLogger.warn(
      {
        ...logContext,
        display_id: order.display_id,
        status: order.status,
        payment_status: order.payment_status,
        customer_email: order.email,
      },
      "Payment failed for order"
    );

    // =====================================================
    // PUNTO DE INTEGRACIÓN: Notificación de fallo de pago
    //
    // Descomentar y adaptar el siguiente código para notificar
    // al cliente cuando su pago falla:
    //
    // const notificationService = container.resolve("notificationService");
    // await notificationService.send(
    //   "payment_failed",
    //   {
    //     order_id: order.id,
    //     display_id: order.display_id,
    //     customer_email: order.email,
    //     customer_name: order.shipping_address?.first_name,
    //     failure_code: data.failure_code,
    //     failure_message: data.failure_message,
    //     // URL para reintentar pago o contactar soporte
    //     retry_url: `${process.env.STORE_URL}/order/${order.id}/retry-payment`,
    //   }
    // );
    // =====================================================

    subscriberLogger.info(
      {
        ...logContext,
        display_id: order.display_id,
      },
      "Payment failed handler completed"
    );
  } catch (error) {
    subscriberLogger.error(
      {
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      },
      "Error in payment failed subscriber"
    );

    // No relanzar el error para no bloquear otros subscribers
  }
}

export const config: SubscriberConfig = {
  event: "order.payment_failed", // Evento custom emitido por PaymentWebhookService
  context: {
    subscriberId: "payment-failed-handler",
  },
};
