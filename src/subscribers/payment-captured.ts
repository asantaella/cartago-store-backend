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
 * Se ejecuta cuando un pago es capturado exitosamente en el servicio PaymentService.
 * Este evento se emite cuando:
 * - Un pago es capturado (Stripe charge.captured, PayPal CHECKOUT.ORDER.COMPLETED)
 * - Para SEPA Direct Debit, cuando el banco confirma el pago (días después)
 *
 * Acciones:
 * - Cambiar el estado del payment de "awaiting" a "captured"
 * - Si la orden existe pero está sin pago, marcarla como pagada
 */
export default async function handlePaymentCaptured({
  data,
  eventName,
  container,
}: SubscriberArgs<Record<string, string>>) {
  const logContext = {
    payment_id: data.id,
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

    // Este subscriber se dispara cuando PaymentService.Events.PAYMENT_CAPTURED es emitido
    // Lo que ocurre cuando:
    // 1. Se captura un pago en el webhook (charge.captured)
    // 2. El webhook emite explícitamente PaymentService.Events.PAYMENT_CAPTURED
    //
    // En este punto:
    // - El pago ya fue capturado por Medusa
    // - El status de la orden ya fue actualizado a "captured"
    // - El evento order.payment_captured ya fue emitido
    //
    // Acciones futuras podrían incluir:
    // - Actualizar inventario si no se hizo automáticamente
    // - Generar documentación adicional
    // - Notificar sistemas externos

    subscriberLogger.info(
      {
        ...logContext,
      },
      "Payment captured handler completed"
    );
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
