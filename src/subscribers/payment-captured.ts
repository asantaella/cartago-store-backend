import {
  type SubscriberConfig,
  type SubscriberArgs,
  OrderService,
} from "@medusajs/medusa";
import PaymentService from "@medusajs/medusa/dist/services/payment";
import { subscriberLogger } from "../utils/logger";

/**
 * Subscriber para el evento payment.payment_captured.
 *
 * Se ejecuta cuando un pago debe ser capturado en la orden (típicamente de webhooks externos).
 * El webhook intenta capturar el pago vía paymentService.capture(), pero si falla
 * (porque ya fue capturado externamente), emite el evento de todos modos.
 *
 * El subscriber es responsable de:
 * 1. Verificar el estado actual del payment
 * 2. Llamar a orderService.capturePayment para recalcular Order.payment_status
 *
 * Acciones:
 * - Llamar orderService.capturePayment(order_id) para recalcular y actualizar Order.payment_status
 */
export default async function handlePaymentCaptured({
  data,
  eventName,
  container,
}: SubscriberArgs<Record<string, string | undefined>>) {
  const logContext = {
    payment_id: data.id,
    order_id: data.order_id,
    event: eventName,
    subscriber: "payment-captured-handler",
  };

  subscriberLogger.info(logContext, "Payment captured subscriber triggered");

  try {
    const orderService: OrderService = container.resolve("orderService");

    subscriberLogger.info(
      {
        ...logContext,
        event: eventName,
      },
      "Payment captured event received"
    );

    if (!data.order_id) {
      subscriberLogger.warn(
        {
          ...logContext,
        },
        "Payment captured event received but no order_id provided"
      );
      return;
    }

    // Llamar orderService.capturePayment para recalcular y actualizar Order.payment_status
    // Esto itera los payments y establece payment_status a "captured" si todos tienen captured_at
    try {
      await orderService.capturePayment(data.order_id);

      subscriberLogger.info(
        {
          ...logContext,
          order_id: data.order_id,
        },
        "Order payment status updated to captured via OrderService.capturePayment"
      );
    } catch (captureOrderError) {
      subscriberLogger.warn(
        {
          ...logContext,
          order_id: data.order_id,
          error:
            captureOrderError instanceof Error
              ? captureOrderError.message
              : String(captureOrderError),
        },
        "OrderService.capturePayment failed (may already be fully captured)"
      );
      // No relanzar - el error ya está logueado
    }
  } catch (error) {
    subscriberLogger.error(
      {
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      },
      "Error in payment captured subscriber"
    );

    // No relanzar el error para no bloquear otros subscribers
    // El error ya está logueado para debugging
  }
}

export const config: SubscriberConfig = {
  event: PaymentService.Events.PAYMENT_CAPTURED,
  context: {
    subscriberId: "payment-captured-handler",
  },
};
