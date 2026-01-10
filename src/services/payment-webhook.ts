import { TransactionBaseService, OrderService } from "@medusajs/medusa";
import PaymentService from "@medusajs/medusa/dist/services/payment";
import { EntityManager } from "typeorm";
import Stripe from "stripe";
import { paymentLogger } from "../utils/logger";
import { PaymentSessionRepository } from "@medusajs/medusa/dist/repositories/payment-session";

type InjectedDependencies = {
  manager: EntityManager;
  cartService: any;
  orderService: any;
  paymentService: any;
  eventBusService: any;
  idempotencyKeyService: any;
  cartCompletionStrategy: any;
  paymentProviderService: any;
};

interface StripePaymentIntent {
  id: string;
  metadata: {
    cart_id?: string;
    resource_id?: string;
    order_id?: string;
  };
  payment_method_types?: string[];
  status: string;
}

interface StripeCharge {
  id: string;
  payment_intent: string | StripePaymentIntent;
  metadata: {
    cart_id?: string;
    resource_id?: string;
    order_id?: string;
  };
  status: string;
  failure_code?: string;
  failure_message?: string;
}

interface PayPalOrder {
  id: string;
  status: string;
  purchase_units: Array<{
    custom_id?: string;
    reference_id?: string;
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
      }>;
    };
  }>;
}

/**
 * Servicio centralizado para procesar webhooks de Stripe y PayPal.
 *
 * Maneja los siguientes eventos:
 * - Stripe: charge.captured, payment_intent.processing, charge.failed
 * - PayPal: CHECKOUT.ORDER.COMPLETED
 *
 * Confía en la idempotencia de cartCompletionStrategy.complete() para evitar
 * procesamiento duplicado de webhooks.
 */
class PaymentWebhookService extends TransactionBaseService {
  protected manager_: EntityManager;
  protected cartService_: any;
  protected orderService_: any;
  protected paymentService_: any;
  protected eventBusService_: any;
  protected idempotencyKeyService_: any;
  protected cartCompletionStrategy_: any;
  protected paymentProviderService_: any;

  constructor(container: InjectedDependencies) {
    super(container);
    this.manager_ = container.manager;
    this.cartService_ = container.cartService;
    this.orderService_ = container.orderService;
    this.paymentService_ = container.paymentService;
    this.eventBusService_ = container.eventBusService;
    this.idempotencyKeyService_ = container.idempotencyKeyService;
    this.cartCompletionStrategy_ = container.cartCompletionStrategy;
    this.paymentProviderService_ = container.paymentProviderService;
  }

  private async createWebhookIdempotencyKey(cartId: string, token: string) {
    const idempotencyKeyValue = `payment-webhook:${cartId}:${token}`;

    try {
      return await this.idempotencyKeyService_.create({
        request_method: "POST",
        request_path: "/webhooks/payment",
        request_params: { cart_id: cartId },
        idempotency_key: idempotencyKeyValue,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      paymentLogger.warn(
        {
          cart_id: cartId,
          idempotency_key: idempotencyKeyValue,
          error: message,
        },
        "Falling back to retrieve existing idempotency key for payment webhook"
      );

      // Si el idempotency key ya existe (reintentos del webhook), lo recuperamos
      return await this.idempotencyKeyService_.retrieve(idempotencyKeyValue);
    }
  }

  private async syncStripePaymentSession(
    cartId: string,
    paymentIntentId?: string,
    isSepaProcessing: boolean = false
  ) {
    if (!paymentIntentId) {
      return;
    }

    try {
      const cart = await this.cartService_.retrieve(cartId, {
        relations: ["payment_sessions", "customer"],
      });

      const paymentSession = cart.payment_sessions?.find(
        (session: any) => session.provider_id === "stripe"
      );

      if (!paymentSession) {
        paymentLogger.warn(
          { cart_id: cartId, payment_intent_id: paymentIntentId },
          "No Stripe payment session available to sync"
        );
        return;
      }

      const currentIntentId = paymentSession.data?.id;

      if (currentIntentId === paymentIntentId && !isSepaProcessing) {
        return;
      }

      const { amount, ...sessionDataWithoutAmount } = (paymentSession.data ??
        {}) as Record<string, unknown>;

      const updatedData: Record<string, unknown> = {
        ...sessionDataWithoutAmount,
        id: paymentIntentId,
        payment_intent: paymentIntentId,
        status: isSepaProcessing
          ? "processing"
          : sessionDataWithoutAmount.status,
      };

      const metadata =
        (updatedData.metadata as Record<string, unknown> | undefined) ?? {};
      metadata.cart_id = cartId;
      updatedData.metadata = metadata;

      const sessionRepo = this.manager_.withRepository(
        PaymentSessionRepository
      );
      const storedSession = await sessionRepo.findOne({
        where: { id: paymentSession.id },
      });
      if (storedSession) {
        storedSession.data = updatedData;
        // Para SEPA en processing, marcar la sesión como "authorized" y seleccionada para permitir completar el carrito
        if (isSepaProcessing) {
          storedSession.status = "authorized";
          storedSession.is_selected = true;
        }
        await sessionRepo.save(storedSession);
      }

      paymentLogger.info(
        {
          cart_id: cartId,
          payment_intent_id: paymentIntentId,
          session_id: paymentSession.id,
          is_sepa_processing: isSepaProcessing,
          session_status: storedSession?.status,
        },
        "Stripe payment session synced with webhook payment_intent"
      );
    } catch (error) {
      paymentLogger.error(
        {
          cart_id: cartId,
          payment_intent_id: paymentIntentId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to sync Stripe payment session from webhook"
      );
      throw error;
    }
  }

  private async tryCompleteCart(cartId: string, token: string) {
    try {
      const idempotencyKey = await this.createWebhookIdempotencyKey(
        cartId,
        token
      );

      const completionResult = await this.cartCompletionStrategy_
        .withTransaction(this.manager_)
        .complete(cartId, idempotencyKey, { source: "payment-webhook" });

      const body = completionResult?.response_body as
        | { data?: any; type?: string }
        | undefined;

      if (body?.type === "order" && body.data) {
        return body.data;
      }

      if (body?.type && body.type !== "order") {
        paymentLogger.info(
          {
            cart_id: cartId,
            token,
            completion_type: body.type,
          },
          "Cart completion returned non-order payload"
        );
      }

      // Fallback: si ya hay una orden asociada al carrito, devolverla
      const orders = await this.orderService_.list(
        { cart_id: cartId },
        { take: 1 }
      );

      if (orders.length > 0) {
        return orders[0];
      }

      paymentLogger.warn(
        {
          cart_id: cartId,
          token,
        },
        "Cart completion did not produce an order - returning null"
      );

      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.toLowerCase().includes("already completed")) {
        const orders = await this.orderService_.list(
          { cart_id: cartId },
          { take: 1 }
        );
        if (orders.length > 0) {
          return orders[0];
        }
      }

      paymentLogger.error(
        {
          cart_id: cartId,
          token,
          error: message,
        },
        "Error during cart completion - attempting to retrieve existing order"
      );

      // Intentar recuperar una orden existente antes de fallar completamente
      try {
        const orders = await this.orderService_.list(
          { cart_id: cartId },
          { take: 1 }
        );
        if (orders.length > 0) {
          return orders[0];
        }
      } catch (retrievalError) {
        // Ignorar error al recuperar
      }

      return null;
    }
  }

  /**
   * Extrae el cart_id de los metadata de Stripe.
   * Busca primero cart_id, luego resource_id para retrocompatibilidad.
   */
  private extractCartId(metadata: {
    cart_id?: string;
    resource_id?: string;
  }): string | null {
    return metadata?.cart_id ?? metadata?.resource_id ?? null;
  }

  /**
   * Verifica si el método de pago es SEPA Direct Debit.
   */
  private isSepaPayment(paymentIntent: StripePaymentIntent): boolean {
    return paymentIntent.payment_method_types?.includes("sepa_debit") ?? false;
  }

  /**
   * Maneja el evento charge.captured de Stripe.
   *
   * Para pagos con tarjeta (captura automática):
   * - Extrae cart_id de metadata
   * - Completa el carrito creando la orden con pago capturado
   * - Medusa emite automáticamente order.payment_captured
   *
   * Para pagos SEPA (captura diferida, días después):
   * - La orden ya existe (creada en payment_intent.processing)
   * - Se busca la orden existente por cart_id
   * - Se captura el pago de la orden existente
   * - Medusa emite automáticamente order.payment_captured al capturar el pago
   *
   * @param charge - Objeto charge de Stripe
   */
  async handleStripeChargeCaptured(
    charge: StripeCharge
  ): Promise<{ success: boolean; order_id?: string; error?: string }> {
    const logContext = {
      charge_id: charge.id,
      event: "charge.captured",
    };

    paymentLogger.info(logContext, "Processing Stripe charge.captured webhook");

    try {
      // El payment_intent puede venir como string o como objeto expandido
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;

      const metadata =
        typeof charge.payment_intent === "object"
          ? charge.payment_intent.metadata
          : charge.metadata;

      const cartId = this.extractCartId(metadata);

      if (!cartId) {
        paymentLogger.warn(
          { ...logContext, metadata },
          "No cart_id found in charge metadata"
        );
        return { success: false, error: "No cart_id in metadata" };
      }

      // Primero intentar buscar una orden existente (SEPA ya procesada)
      const existingOrders = await this.orderService_.list(
        { cart_id: cartId },
        { take: 1 }
      );
      let order = existingOrders.length > 0 ? existingOrders[0] : null;

      // Si no hay orden existente, completar el carrito (tarjeta u otro método)
      if (!order) {
        paymentLogger.info(
          {
            ...logContext,
            cart_id: cartId,
            payment_intent_id: paymentIntentId,
          },
          "No existing order found - completing cart from charge.captured"
        );

        await this.syncStripePaymentSession(cartId, paymentIntentId);

        const completionToken = paymentIntentId
          ? `stripe-charge:${paymentIntentId}`
          : `stripe-charge:${charge.id}`;

        // Intentar completar el carrito - idempotente por evento
        order = await this.tryCompleteCart(cartId, completionToken);
      } else {
        paymentLogger.info(
          {
            ...logContext,
            cart_id: cartId,
            order_id: order.id,
            payment_status: order.payment_status,
          },
          "Found existing order (likely SEPA payment) - will capture payment"
        );
      }

      if (order?.id) {
        paymentLogger.info(
          {
            ...logContext,
            cart_id: cartId,
            order_id: order.id,
            display_id: order.display_id,
            current_payment_status: order.payment_status,
          },
          "Processing charge.captured for order"
        );

        // Capturar el pago usando orderService
        // Esto actualiza payment_status a "captured" y emite order.payment_captured automáticamente
        try {
          await this.orderService_.capturePayment(order.id);

          paymentLogger.info(
            {
              ...logContext,
              order_id: order.id,
            },
            "Payment captured successfully"
          );

          // Emitir evento PaymentService.PAYMENT_CAPTURED para que se procese por subscribers
          // Si hay pagos en la captura, emitir para cada uno
          if (order.payments && order.payments.length > 0) {
            for (const payment of order.payments) {
              try {
                await this.eventBusService_.emit(
                  PaymentService.Events.PAYMENT_CAPTURED,
                  {
                    id: payment.id,
                  }
                );
              } catch (emitError) {
                paymentLogger.warn(
                  {
                    ...logContext,
                    payment_id: payment.id,
                    error:
                      emitError instanceof Error
                        ? emitError.message
                        : String(emitError),
                  },
                  "Failed to emit PAYMENT_CAPTURED event"
                );
              }
            }
          }
        } catch (captureError) {
          // Si ya está capturado o hay error, registrar pero continuar
          paymentLogger.warn(
            {
              ...logContext,
              order_id: order.id,
              error:
                captureError instanceof Error
                  ? captureError.message
                  : String(captureError),
            },
            "Payment capture warning (may already be captured)"
          );
        }

        return { success: true, order_id: order.id };
      }

      paymentLogger.info(
        { ...logContext, cart_id: cartId },
        "No order could be created or found"
      );
      return { success: true };
    } catch (error) {
      paymentLogger.error(
        {
          ...logContext,
          error: error instanceof Error ? error.message : String(error),
        },
        "Error processing charge.captured"
      );
      throw error;
    }
  }

  /**
   * Maneja el evento payment_intent.processing de Stripe (solo SEPA).
   *
   * Para SEPA Direct Debit, el pago queda en estado "processing" hasta que
   * el banco confirme la transferencia (puede tardar días).
   *
   * - Completa el carrito
   * - La orden se crea con payment_status: awaiting
   *
   * @param paymentIntent - Objeto payment_intent de Stripe
   */
  async handleStripeProcessing(
    paymentIntent: StripePaymentIntent
  ): Promise<{ success: boolean; order_id?: string; error?: string }> {
    const logContext = {
      payment_intent_id: paymentIntent.id,
      event: "payment_intent.processing",
    };

    paymentLogger.info(
      logContext,
      "Processing Stripe payment_intent.processing webhook"
    );

    // Solo procesar SEPA
    if (!this.isSepaPayment(paymentIntent)) {
      paymentLogger.info(
        {
          ...logContext,
          payment_method_types: paymentIntent.payment_method_types,
        },
        "Ignoring non-SEPA processing event"
      );
      return { success: true };
    }

    try {
      const cartId = this.extractCartId(paymentIntent.metadata);

      if (!cartId) {
        paymentLogger.warn(
          { ...logContext, metadata: paymentIntent.metadata },
          "No cart_id found in payment_intent metadata"
        );
        return { success: false, error: "No cart_id in metadata" };
      }

      paymentLogger.info(
        { ...logContext, cart_id: cartId },
        "Completing cart for SEPA payment (pending)"
      );

      await this.syncStripePaymentSession(cartId, paymentIntent.id, true);

      const completionToken = `stripe-processing:${paymentIntent.id}`;

      // Completar carrito - el estado del pago será "awaiting" para SEPA
      const order = await this.tryCompleteCart(cartId, completionToken);

      if (order?.id) {
        paymentLogger.info(
          {
            ...logContext,
            cart_id: cartId,
            order_id: order.id,
            payment_status: order.payment_status,
          },
          "SEPA order created with pending payment"
        );

        return { success: true, order_id: order.id };
      }

      paymentLogger.info(
        { ...logContext, cart_id: cartId },
        "Cart completion returned null - order may already exist or require more data"
      );
      return { success: true };
    } catch (error) {
      paymentLogger.error(
        {
          ...logContext,
          error: error instanceof Error ? error.message : String(error),
        },
        "Error processing payment_intent.processing"
      );
      throw error;
    }
  }

  /**
   * Maneja el evento charge.failed de Stripe.
   *
   * Para SEPA Direct Debit cuando el banco rechaza el pago:
   * - Busca la orden existente usando order_id de metadata
   * - Actualiza el estado de la orden a requires_action
   * - Emite evento para notificar al cliente
   *
   * @param charge - Objeto charge de Stripe con failure_code y failure_message
   */
  async handleStripeChargeFailed(
    charge: StripeCharge
  ): Promise<{ success: boolean; order_id?: string; error?: string }> {
    const logContext = {
      charge_id: charge.id,
      event: "charge.failed",
      failure_code: charge.failure_code,
      failure_message: charge.failure_message,
    };

    paymentLogger.warn(logContext, "Processing Stripe charge.failed webhook");

    try {
      const metadata =
        typeof charge.payment_intent === "object"
          ? charge.payment_intent.metadata
          : charge.metadata;

      // Para SEPA failed, buscamos order_id en metadata
      const orderId = metadata?.order_id;
      const cartId = this.extractCartId(metadata);

      if (!orderId && !cartId) {
        paymentLogger.warn(
          { ...logContext, metadata },
          "No order_id or cart_id found in failed charge metadata"
        );
        return { success: false, error: "No order_id or cart_id in metadata" };
      }

      // Si tenemos order_id, actualizar la orden directamente
      if (orderId) {
        paymentLogger.info(
          { ...logContext, order_id: orderId },
          "Updating order status to requires_action"
        );

        await this.orderService_.update(orderId, {
          status: "requires_action",
          metadata: {
            payment_failure_code: charge.failure_code,
            payment_failure_message: charge.failure_message,
            payment_failed_at: new Date().toISOString(),
          },
        });

        // Emitir evento para que los subscribers puedan notificar al cliente
        await this.eventBusService_.emit("order.payment_failed", {
          id: orderId,
          failure_code: charge.failure_code,
          failure_message: charge.failure_message,
        });

        paymentLogger.info(
          { ...logContext, order_id: orderId },
          "Order updated to requires_action"
        );
        return { success: true, order_id: orderId };
      }

      // Si solo tenemos cart_id, intentar buscar la orden asociada
      if (cartId) {
        paymentLogger.info(
          { ...logContext, cart_id: cartId },
          "Looking for order by cart_id"
        );

        try {
          const orders = await this.orderService_.list(
            { cart_id: cartId },
            { take: 1 }
          );

          if (orders.length > 0) {
            const order = orders[0];
            await this.orderService_.update(order.id, {
              status: "requires_action",
              metadata: {
                payment_failure_code: charge.failure_code,
                payment_failure_message: charge.failure_message,
                payment_failed_at: new Date().toISOString(),
              },
            });

            await this.eventBusService_.emit("order.payment_failed", {
              id: order.id,
              failure_code: charge.failure_code,
              failure_message: charge.failure_message,
            });

            paymentLogger.info(
              { ...logContext, order_id: order.id },
              "Order found and updated to requires_action"
            );
            return { success: true, order_id: order.id };
          }
        } catch (err) {
          paymentLogger.warn(
            { ...logContext, cart_id: cartId },
            "No order found for cart_id"
          );
        }
      }

      paymentLogger.warn(
        logContext,
        "Could not find order to update for failed charge"
      );
      return { success: false, error: "Order not found" };
    } catch (error) {
      paymentLogger.error(
        {
          ...logContext,
          error: error instanceof Error ? error.message : String(error),
        },
        "Error processing charge.failed"
      );
      throw error;
    }
  }

  /**
   * Maneja el evento CHECKOUT.ORDER.COMPLETED de PayPal.
   *
   * Para pagos PayPal (captura automática):
   * - Extrae cart_id de custom_id en purchase_units
   * - Completa el carrito creando la orden con pago capturado
   * - Medusa emite automáticamente order.payment_captured
   *
   * @param paypalOrder - Objeto order de PayPal
   */
  async handlePayPalCompleted(
    paypalOrder: PayPalOrder
  ): Promise<{ success: boolean; order_id?: string; error?: string }> {
    const logContext = {
      paypal_order_id: paypalOrder.id,
      event: "CHECKOUT.ORDER.COMPLETED",
      status: paypalOrder.status,
    };

    paymentLogger.info(
      logContext,
      "Processing PayPal CHECKOUT.ORDER.COMPLETED webhook"
    );

    try {
      // Extraer cart_id de custom_id en el primer purchase_unit
      const cartId = paypalOrder.purchase_units?.[0]?.custom_id;

      if (!cartId) {
        paymentLogger.warn(
          { ...logContext, purchase_units: paypalOrder.purchase_units },
          "No cart_id (custom_id) found in PayPal order"
        );
        return { success: false, error: "No cart_id in custom_id" };
      }

      paymentLogger.info(
        { ...logContext, cart_id: cartId },
        "Completing cart from PayPal webhook"
      );

      // Actualizar la sesión de pago con los datos de PayPal ANTES de completar el carrito
      // Esto asegura que cuando se cree la orden, tenga los datos correctos de captura
      try {
        const cart = await this.cartService_.retrieve(cartId, {
          relations: ["payment_sessions"],
        });

        const paypalSession = cart.payment_sessions?.find(
          (ps) => ps.provider_id === "paypal"
        );

        if (paypalSession) {
          paymentLogger.info(
            { ...logContext, cart_id: cartId, session_id: paypalSession.id },
            "Updating PayPal session with captured order data"
          );

          // Actualizar directamente los datos de la sesión con la orden capturada
          const paymentSessionRepo =
            this.manager_.getRepository("PaymentSession");
          await paymentSessionRepo.update(paypalSession.id, {
            data: paypalOrder as any,
            status: "authorized", // PayPal COMPLETED = authorized en Medusa
          });

          paymentLogger.info(
            { ...logContext, cart_id: cartId, session_id: paypalSession.id },
            "PayPal session updated with captured order status"
          );
        }
      } catch (sessionError) {
        paymentLogger.warn(
          {
            ...logContext,
            cart_id: cartId,
            error:
              sessionError instanceof Error
                ? sessionError.message
                : String(sessionError),
          },
          "Failed to update payment session before cart completion"
        );
      }

      const completionToken = `paypal:${paypalOrder.id}`;

      // Completar carrito - idempotente por evento
      const order = await this.tryCompleteCart(cartId, completionToken);

      if (order?.id) {
        paymentLogger.info(
          {
            ...logContext,
            cart_id: cartId,
            order_id: order.id,
            display_id: order.display_id,
          },
          "Cart completed successfully from PayPal webhook"
        );

        // Para PayPal con capture:true, verificamos si el pago necesita ser capturado
        try {
          const orderWithPayments = await this.orderService_.retrieve(
            order.id,
            {
              relations: ["payments"],
            }
          );

          const payment = orderWithPayments.payments?.[0];

          paymentLogger.info(
            {
              ...logContext,
              order_id: order.id,
              payment_id: payment?.id,
              payment_captured_at: payment?.captured_at,
              payment_amount: payment?.amount,
            },
            "Payment state before capture attempt"
          );

          if (payment && !payment.captured_at) {
            // Como la orden de PayPal ya fue capturada externamente,
            // actualizamos directamente el payment en lugar de llamar capturePayment
            const captureTime = new Date();
            const paymentRepo = this.manager_.getRepository("Payment");

            await paymentRepo.update(payment.id, {
              captured_at: captureTime,
            });

            paymentLogger.info(
              {
                ...logContext,
                order_id: order.id,
                payment_id: payment.id,
                captured_at: captureTime.toISOString(),
              },
              "Payment marked as captured (external PayPal capture)"
            );

            // Actualizar el payment_status de la orden
            const orderRepo = this.manager_.getRepository("Order");
            await orderRepo.update(order.id, {
              payment_status: "captured",
            });

            paymentLogger.info(
              {
                ...logContext,
                order_id: order.id,
                payment_status: "captured",
              },
              "Order payment status updated to captured"
            );
          } else {
            paymentLogger.info(
              {
                ...logContext,
                order_id: order.id,
                payment_captured_at: payment?.captured_at,
              },
              "Payment already captured"
            );
          }
        } catch (captureError) {
          paymentLogger.error(
            {
              ...logContext,
              order_id: order.id,
              error:
                captureError instanceof Error
                  ? captureError.message
                  : String(captureError),
              stack:
                captureError instanceof Error ? captureError.stack : undefined,
            },
            "Failed to capture payment"
          );
        }

        return { success: true, order_id: order.id };
      }

      paymentLogger.info(
        { ...logContext, cart_id: cartId },
        "Cart already completed (idempotent)"
      );
      return { success: true };
    } catch (error) {
      paymentLogger.error(
        {
          ...logContext,
          error: error instanceof Error ? error.message : String(error),
        },
        "Error processing PayPal webhook"
      );
      throw error;
    }
  }
}

export default PaymentWebhookService;
