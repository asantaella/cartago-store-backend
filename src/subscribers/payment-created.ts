import { type SubscriberConfig, type SubscriberArgs } from "@medusajs/medusa";
import PaymentService from "@medusajs/medusa/dist/services/payment";
import { subscriberLogger } from "../utils/logger";

/**
 * Subscriber para el evento payment.created.
 *
 * Se ejecuta cuando se crea un nuevo payment en el sistema.
 * Para pagos SEPA Direct Debit, este evento se emite cuando:
 * - Se inicia una transferencia SEPA (payment_intent.processing en Stripe)
 * - El pago se crea en estado "awaiting" (pendiente de confirmación bancaria)
 *
 * Acciones:
 * - Crear la Order a partir del Cart
 * - La orden se genera con payment_status: "awaiting" (pendiente)
 * - La orden permanecerá en este estado hasta que Stripe confirme el pago (charge.captured)
 */
export default async function handlePaymentCreated({
  data,
  eventName,
  container,
}: SubscriberArgs<Record<string, string>>) {
  const logContext = {
    payment_id: data.id,
    event: eventName,
    subscriber: "payment-created-handler",
  };

  subscriberLogger.info(logContext, "Payment created subscriber triggered");

  try {
    subscriberLogger.info(
      {
        ...logContext,
      },
      "Payment created event received"
    );

    // Este subscriber no realiza acciones adicionales actualmente.
    // El flujo para SEPA es:
    // 1. payment_intent.processing webhook -> crea la Order en payment-webhook service
    // 2. Este evento se emite cuando se crea el payment
    // 3. charge.captured webhook -> emite PaymentService.PAYMENT_CAPTURED
    //
    // En el futuro, este subscriber podría usarse para:
    // - Emitir notificaciones de pago pendiente
    // - Registrar auditoría del inicio del pago
    // - Validaciones adicionales

    subscriberLogger.info(
      {
        ...logContext,
      },
      "Payment created handler completed"
    );
  } catch (error) {
    subscriberLogger.error(
      {
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      },
      "Error in payment created subscriber"
    );

    // No relanzar el error para no bloquear otros subscribers
    // El error ya está logueado para debugging
  }
}

export const config: SubscriberConfig = {
  event: PaymentService.Events.CREATED,
  context: {
    subscriberId: "payment-created-handler",
  },
};
