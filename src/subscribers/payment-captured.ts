import {
  type SubscriberConfig,
  type SubscriberArgs,
  OrderService,
  PaymentService,
} from "@medusajs/medusa";
import PaymentServiceClass from "@medusajs/medusa/dist/services/payment";
import { subscriberLogger } from "../utils/logger";
import { retryWithBackoff } from "../utils/retry-handler";

/**
 * Subscriber para el evento payment.payment_captured.
 *
 * Se ejecuta cuando un pago debe ser capturado en la orden (típicamente de webhooks externos).
 * En lugar de llamar a paymentService.capture() (que intenta comunicarse con el proveedor),
 * actualiza directamente payment.captured_at en la BD y recalcula el estado de la orden.
 *
 * Esto es necesario para PayPal sandbox que deja pagos en PENDING_REVIEW indefinidamente.
 *
 * El subscriber es responsable de:
 * 1. Actualizar payment.captured_at en la BD
 * 2. Llamar a orderService.capturePayment para recalcular Order.payment_status
 *
 * Acciones:
 * - Actualizar payment.captured_at directamente en la BD
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
    const eventBusService = container.resolve("eventBusService");

    subscriberLogger.info(
      {
        ...logContext,
        event: eventName,
      },
      "Payment captured event received",
    );

    if (!data.order_id || !data.id) {
      subscriberLogger.warn(
        {
          ...logContext,
        },
        "Payment captured event received but missing order_id or payment_id",
      );
      return;
    }

    try {
      const paymentRepository = container.resolve("paymentRepository");

      // Primero: Actualizar payment.captured_at directamente en la BD
      // (No llamamos a paymentService.capture() porque eso intenta comunicarse con el proveedor de pago)
      await retryWithBackoff(
        async () => {
          subscriberLogger.info(
            {
              ...logContext,
              payment_id: data.id,
            },
            "Setting payment.captured_at to current timestamp",
          );

          await paymentRepository.update(data.id!, {
            captured_at: new Date(),
          });

          subscriberLogger.info(
            {
              ...logContext,
              payment_id: data.id,
            },
            "✅ Payment.captured_at updated successfully in DB",
          );
        },
        {
          maxRetries: 3,
          delays: [1000, 5000, 15000],
          context: {
            payment_id: data.id,
            order_id: data.order_id,
            operation: "update_payment_captured_at",
          },
          eventBus: eventBusService,
        },
      );

      // Segundo: Recalcular el estado de pago de la orden
      // MedusaJS auto-calcula order.payment_status basándose en los payments capturados
      await retryWithBackoff(
        async () => {
          subscriberLogger.info(
            {
              ...logContext,
              order_id: data.order_id,
            },
            "Calling orderService.capturePayment to recalculate order payment status",
          );

          await orderService.capturePayment(data.order_id!);

          subscriberLogger.info(
            {
              ...logContext,
              order_id: data.order_id,
            },
            "✅ Order payment status recalculated",
          );
        },
        {
          maxRetries: 3,
          delays: [1000, 5000, 15000],
          context: {
            payment_id: data.id,
            order_id: data.order_id,
            operation: "capture_order_payment",
          },
          eventBus: eventBusService,
        },
      );

      subscriberLogger.info(
        {
          ...logContext,
          order_id: data.order_id,
        },
        "✅ Payment captured: payment.captured_at set + order payment status updated to captured",
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
        "Payment capture or order update failed after retries",
      );
      // No relanzar - el error ya está logueado
    }
  } catch (error) {
    subscriberLogger.error(
      {
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      },
      "Error in payment captured subscriber",
    );

    // No relanzar el error para no bloquear otros subscribers
    // El error ya está logueado para debugging
  }
}

export const config: SubscriberConfig = {
  event: PaymentServiceClass.Events.PAYMENT_CAPTURED,
  context: {
    subscriberId: "payment-captured-handler",
  },
};
