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
  totalsService: any;
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
  resource_id?: string; // ← Cart ID (usado por MedusaJS PayPal provider)
  payer?: {
    email_address?: string;
    payer_id?: string;
  };
  purchase_units: Array<{
    custom_id?: string;
    reference_id?: string;
    amount?: {
      currency_code: string;
      value: string;
    };
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        status_details?: {
          reason?: string;
        };
      }>;
    };
  }>;
}

/**
 * Servicio centralizado para procesar webhooks de Stripe y PayPal.
 *
 * ESTRATEGIA DE CART COMPLETION:
 * ===============================
 * El frontend NUNCA completa el cart tras el pago de PayPal o Stripe.
 * El backend es el único responsable de completar el cart cuando:
 * 1. Recibe el webhook del proveedor de pago (PayPal/Stripe)
 * 2. Valida la firma del webhook
 * 3. Confirma que el pago está capturado/autorizado
 * 4. Completa el cart usando CartCompletionStrategy de Medusa
 *
 * El frontend solo:
 * - Crea el cart y selecciona el método de pago
 * - Redirige al usuario a PayPal/Stripe para autorizar
 * - Hace polling al cart para verificar que tenga order_id tras el webhook
 *
 * Eventos manejados:
 * ==================
 * Stripe:
 * - charge.captured: Completa el cart con pago capturado (tarjeta)
 * - payment_intent.processing: Crea orden con pago pendiente (SEPA)
 * - charge.failed: Marca orden como fallida (SEPA rechazado)
 *
 * PayPal:
 * - CHECKOUT.ORDER.COMPLETED: Completa el cart si el pago está capturado
 * - PAYMENT.CAPTURE.COMPLETED: Evento de backup para completar el cart
 * - PAYMENT.CAPTURE.DENIED: Cancela la orden
 *
 * Idempotencia:
 * =============
 * - Usa idempotencyKeyService para evitar procesamiento duplicado
 * - CartCompletionStrategy.complete() es idempotente por diseño
 * - Verifica si ya existe una orden antes de completar el cart
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
  protected totalsService_: any;

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
    this.totalsService_ = container.totalsService;
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
        "Falling back to retrieve existing idempotency key for payment webhook",
      );

      // Si el idempotency key ya existe (reintentos del webhook), lo recuperamos
      return await this.idempotencyKeyService_.retrieve(idempotencyKeyValue);
    }
  }

  private async syncStripePaymentSession(
    cartId: string,
    paymentIntentId?: string,
    isSepaProcessing: boolean = false,
  ) {
    if (!paymentIntentId) {
      return;
    }

    try {
      const cart = await this.cartService_.retrieve(cartId, {
        relations: ["payment_sessions", "customer"],
      });

      const paymentSession = cart.payment_sessions?.find(
        (session: any) => session.provider_id === "stripe",
      );

      if (!paymentSession) {
        paymentLogger.warn(
          { cart_id: cartId, payment_intent_id: paymentIntentId },
          "No Stripe payment session available to sync",
        );
        return;
      }

      const currentIntentId = paymentSession.data?.id;

      if (currentIntentId === paymentIntentId && !isSepaProcessing) {
        return;
      }

      const currentData = (paymentSession.data ?? {}) as Record<
        string,
        unknown
      >;

      // Preservar amount y demás campos; solo actualizamos ids/metadata y status en data si aplica
      const updatedData: Record<string, unknown> = {
        ...currentData,
        id: paymentIntentId,
        payment_intent: paymentIntentId,
        status: isSepaProcessing ? "processing" : currentData.status,
      };

      const metadata =
        (updatedData.metadata as Record<string, unknown> | undefined) ?? {};
      metadata.cart_id = cartId;
      updatedData.metadata = metadata;

      const sessionRepo = this.manager_.withRepository(
        PaymentSessionRepository,
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
        "Stripe payment session synced with webhook payment_intent",
      );
    } catch (error) {
      paymentLogger.error(
        {
          cart_id: cartId,
          payment_intent_id: paymentIntentId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to sync Stripe payment session from webhook",
      );
      throw error;
    }
  }

  /**
   * Busca el cart_id asociado a un PayPal order ID.
   *
   * Estrategias (en orden de prioridad):
   * 1. resource_id (campo usado por el plugin de PayPal de MedusaJS)
   * 2. custom_id en purchase_units (si el frontend lo envió)
   * 3. reference_id en purchase_units (alternativa)
   * 4. Búsqueda en payment_sessions por order ID
   * 5. Cart más reciente sin orden (último recurso)
   */
  private async findCartIdForPayPalOrder(
    paypalOrder: PayPalOrder,
  ): Promise<string | null> {
    const paypalOrderId = paypalOrder.id;

    paymentLogger.info(
      {
        paypal_order_id: paypalOrderId,
        has_resource_id: !!paypalOrder.resource_id,
        has_custom_id: !!paypalOrder.purchase_units?.[0]?.custom_id,
        has_reference_id: !!paypalOrder.purchase_units?.[0]?.reference_id,
      },
      "Finding cart_id for PayPal order",
    );

    try {
      // ESTRATEGIA 1: resource_id (campo usado por MedusaJS PayPal provider)
      const resourceId = paypalOrder.resource_id;
      if (resourceId) {
        paymentLogger.info(
          {
            paypal_order_id: paypalOrderId,
            cart_id: resourceId,
            method: "resource_id",
          },
          "✓ Found cart_id in PayPal resource_id",
        );
        return resourceId;
      }

      // ESTRATEGIA 2: custom_id en purchase_units (alternativa)
      const customId = paypalOrder.purchase_units?.[0]?.custom_id;
      if (customId) {
        paymentLogger.info(
          {
            paypal_order_id: paypalOrderId,
            cart_id: customId,
            method: "custom_id",
          },
          "✓ Found cart_id in PayPal custom_id",
        );
        return customId;
      }

      // ESTRATEGIA 3: reference_id en purchase_units
      const referenceId = paypalOrder.purchase_units?.[0]?.reference_id;
      if (referenceId && referenceId.startsWith("cart_")) {
        paymentLogger.info(
          {
            paypal_order_id: paypalOrderId,
            cart_id: referenceId,
            method: "reference_id",
          },
          "✓ Found cart_id in PayPal reference_id",
        );
        return referenceId;
      }

      paymentLogger.info(
        { paypal_order_id: paypalOrderId },
        "No resource_id/custom_id/reference_id in webhook - searching by order ID in payment sessions",
      );

      const paymentSessionRepo = this.manager_.withRepository(
        PaymentSessionRepository,
      );

      // Buscar sesiones PayPal recientes (últimas 100)
      const recentSessions = await paymentSessionRepo.find({
        where: { provider_id: "paypal" },
        order: { created_at: "DESC" },
        take: 100,
      });

      paymentLogger.info(
        {
          paypal_order_id: paypalOrderId,
          sessions_count: recentSessions.length,
        },
        "Searching in recent PayPal payment sessions",
      );

      // ESTRATEGIA 4: Order ID exacto en payment sessions
      for (const session of recentSessions) {
        const sessionData = session.data as any;

        // Buscar coincidencia exacta del order ID
        if (sessionData?.id === paypalOrderId) {
          // Verificar que no exista orden para este cart
          const existingOrders = await this.orderService_.list(
            { cart_id: session.cart_id },
            { take: 1 },
          );

          // Si existe orden, retornar el cart_id de todas formas
          // Puede que sea PAYMENT.CAPTURE.COMPLETED buscando actualizar la orden existente
          paymentLogger.info(
            {
              paypal_order_id: paypalOrderId,
              cart_id: session.cart_id,
              session_id: session.id,
              session_created: session.created_at,
              order_exists: existingOrders.length > 0,
              order_id: existingOrders[0]?.id,
              method: "exact_order_id",
            },
            existingOrders.length > 0
              ? "✓ Found cart_id with existing order - may be CAPTURE.COMPLETED"
              : "✓ Found cart_id by exact PayPal order ID match",
          );
          return session.cart_id;
        }
      }

      paymentLogger.info(
        { paypal_order_id: paypalOrderId },
        "No exact order ID match - trying fallback: most recent incomplete cart",
      );

      // ESTRATEGIA 5: Cart más reciente sin orden (fallback con validaciones)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      for (const session of recentSessions) {
        // Verificar que el carrito no tenga orden
        const existingOrders = await this.orderService_.list(
          { cart_id: session.cart_id },
          { take: 1 },
        );

        if (existingOrders.length > 0) {
          continue; // Ya tiene orden
        }

        // Verificar que el carrito no esté completado y sea reciente
        try {
          const cart = await this.cartService_.retrieve(session.cart_id, {
            select: ["id", "completed_at", "created_at", "email"],
          });

          const isIncomplete = !cart.completed_at;
          const isRecent = cart.created_at > oneHourAgo;

          if (isIncomplete && isRecent) {
            // Verificar coincidencia de email (si está disponible en el webhook)
            const webhookEmail = paypalOrder.payer?.email_address;
            const emailMatches = !webhookEmail || cart.email === webhookEmail;

            if (emailMatches) {
              paymentLogger.info(
                {
                  paypal_order_id: paypalOrderId,
                  cart_id: cart.id,
                  cart_created: cart.created_at,
                  cart_email: cart.email,
                  webhook_email: webhookEmail,
                  session_id: session.id,
                  method: "recent_incomplete_cart",
                },
                "✓ Found cart_id from most recent incomplete PayPal cart",
              );
              return cart.id;
            } else {
              paymentLogger.warn(
                {
                  paypal_order_id: paypalOrderId,
                  cart_id: cart.id,
                  cart_email: cart.email,
                  webhook_email: webhookEmail,
                },
                "Email mismatch - skipping cart",
              );
            }
          }
        } catch (cartError) {
          paymentLogger.warn(
            {
              paypal_order_id: paypalOrderId,
              cart_id: session.cart_id,
              error:
                cartError instanceof Error
                  ? cartError.message
                  : String(cartError),
            },
            "Error retrieving cart - skipping",
          );
        }
      }

      paymentLogger.error(
        {
          paypal_order_id: paypalOrderId,
          strategies_tried: [
            "resource_id",
            "custom_id",
            "reference_id",
            "exact_order_id",
            "recent_incomplete_cart",
          ],
        },
        "❌ No cart found for PayPal order after trying all strategies",
      );
      return null;
    } catch (error) {
      paymentLogger.error(
        {
          paypal_order_id: paypalOrderId,
          error: error instanceof Error ? error.message : String(error),
        },
        "❌ Error finding cart for PayPal order",
      );
      return null;
    }
  }

  private async tryCompleteCart(cartId: string, token: string) {
    try {
      const idempotencyKey = await this.createWebhookIdempotencyKey(
        cartId,
        token,
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
          "Cart completion returned non-order payload",
        );
      }

      // Fallback: si ya hay una orden asociada al carrito, devolverla
      const orders = await this.orderService_.list(
        { cart_id: cartId },
        { take: 1 },
      );

      if (orders.length > 0) {
        return orders[0];
      }

      paymentLogger.warn(
        {
          cart_id: cartId,
          token,
        },
        "Cart completion did not produce an order - returning null",
      );

      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.toLowerCase().includes("already completed")) {
        const orders = await this.orderService_.list(
          { cart_id: cartId },
          { take: 1 },
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
        "Error during cart completion - attempting to retrieve existing order",
      );

      // Intentar recuperar una orden existente antes de fallar completamente
      try {
        const orders = await this.orderService_.list(
          { cart_id: cartId },
          { take: 1 },
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
    charge: StripeCharge,
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
          "No cart_id found in charge metadata",
        );
        return { success: false, error: "No cart_id in metadata" };
      }

      // Primero intentar buscar una orden existente (SEPA ya procesada)
      const existingOrders = await this.orderService_.list(
        { cart_id: cartId },
        { take: 1 },
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
          "No existing order found - completing cart from charge.captured",
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
          "Found existing order (likely SEPA payment) - will capture payment",
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
          "Processing charge.captured for order",
        );

        // Obtener el payment de la orden para emitir el evento
        try {
          const orderWithPayments = await this.orderService_.retrieve(
            order.id,
            {
              relations: ["payments"],
            },
          );

          const payment = orderWithPayments.payments?.[0];

          if (payment) {
            // Emitir evento PaymentService.PAYMENT_CAPTURED una sola vez
            // El subscriber payment-captured.ts manejará la captura y recalculará order.payment_status
            await this.eventBusService_.emit(
              PaymentService.Events.PAYMENT_CAPTURED,
              {
                id: payment.id,
                order_id: order.id,
              },
            );

            paymentLogger.info(
              {
                ...logContext,
                order_id: order.id,
                payment_id: payment.id,
              },
              "Emitted PAYMENT_CAPTURED event - subscriber will handle capture",
            );
          } else {
            paymentLogger.warn(
              {
                ...logContext,
                order_id: order.id,
              },
              "No payment found in order",
            );
          }
        } catch (emitError) {
          paymentLogger.error(
            {
              ...logContext,
              order_id: order.id,
              error:
                emitError instanceof Error
                  ? emitError.message
                  : String(emitError),
            },
            "Failed to emit PAYMENT_CAPTURED event",
          );
        }

        return { success: true, order_id: order.id };
      }

      paymentLogger.info(
        { ...logContext, cart_id: cartId },
        "No order could be created or found",
      );
      return { success: true };
    } catch (error) {
      paymentLogger.error(
        {
          ...logContext,
          error: error instanceof Error ? error.message : String(error),
        },
        "Error processing charge.captured",
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
    paymentIntent: StripePaymentIntent,
  ): Promise<{ success: boolean; order_id?: string; error?: string }> {
    const logContext = {
      payment_intent_id: paymentIntent.id,
      event: "payment_intent.processing",
    };

    paymentLogger.info(
      logContext,
      "Processing Stripe payment_intent.processing webhook",
    );

    // Solo procesar SEPA
    if (!this.isSepaPayment(paymentIntent)) {
      paymentLogger.info(
        {
          ...logContext,
          payment_method_types: paymentIntent.payment_method_types,
        },
        "Ignoring non-SEPA processing event",
      );
      return { success: true };
    }

    try {
      const cartId = this.extractCartId(paymentIntent.metadata);

      if (!cartId) {
        paymentLogger.warn(
          { ...logContext, metadata: paymentIntent.metadata },
          "No cart_id found in payment_intent metadata",
        );
        return { success: false, error: "No cart_id in metadata" };
      }

      paymentLogger.info(
        { ...logContext, cart_id: cartId },
        "Creating order for SEPA payment (processing state)",
      );

      // Sincronizar la sesión de pago
      await this.syncStripePaymentSession(cartId, paymentIntent.id, true);

      // Completar el carrito usando la estrategia estándar (ahora con sesión autorizada)
      const completionToken = `stripe-processing:${paymentIntent.id}`;
      const order = await this.tryCompleteCart(cartId, completionToken);

      if (order?.id) {
        // Asegurar que las órdenes SEPA queden en estado de pago "awaiting" sin SQL directo
        try {
          if (order.payment_status !== "awaiting") {
            await this.orderService_
              .withTransaction(this.manager_)
              .update(order.id, { payment_status: "awaiting" });

            paymentLogger.info(
              {
                ...logContext,
                cart_id: cartId,
                order_id: order.id,
                previous_payment_status: order.payment_status,
              },
              "Normalized SEPA order payment_status to 'awaiting'",
            );

            // Refrescar el objeto en memoria
            order.payment_status = "awaiting";
          }
        } catch (normalizeError) {
          paymentLogger.warn(
            {
              ...logContext,
              cart_id: cartId,
              order_id: order.id,
              error:
                normalizeError instanceof Error
                  ? normalizeError.message
                  : String(normalizeError),
            },
            "Failed to normalize SEPA order payment_status to 'awaiting'",
          );
        }

        paymentLogger.info(
          {
            ...logContext,
            cart_id: cartId,
            order_id: order.id,
            order_display_id: order.display_id,
            payment_status: order.payment_status,
          },
          "SEPA order successfully created in 'awaiting' payment state",
        );

        return { success: true, order_id: order.id };
      }

      paymentLogger.warn(
        { ...logContext, cart_id: cartId },
        "Cart completion returned null after processing event",
      );
      return { success: true };
    } catch (error) {
      paymentLogger.error(
        {
          ...logContext,
          error: error instanceof Error ? error.message : String(error),
        },
        "Error processing payment_intent.processing",
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
    charge: StripeCharge,
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
          "No order_id or cart_id found in failed charge metadata",
        );
        return { success: false, error: "No order_id or cart_id in metadata" };
      }

      // Si tenemos order_id, emitir evento directamente
      if (orderId) {
        paymentLogger.info(
          { ...logContext, order_id: orderId },
          "Emitting payment_failed event for order",
        );

        await this.eventBusService_.emit("order.payment_failed", {
          id: orderId,
          failure_code: charge.failure_code,
          failure_message: charge.failure_message,
        });

        paymentLogger.info(
          { ...logContext, order_id: orderId },
          "Payment failed event emitted - subscriber will update order status",
        );
        return { success: true, order_id: orderId };
      }

      // Si solo tenemos cart_id, intentar buscar la orden asociada
      if (cartId) {
        paymentLogger.info(
          { ...logContext, cart_id: cartId },
          "Looking for order by cart_id",
        );

        try {
          const orders = await this.orderService_.list(
            { cart_id: cartId },
            { take: 1 },
          );

          if (orders.length > 0) {
            const order = orders[0];

            await this.eventBusService_.emit("order.payment_failed", {
              id: order.id,
              failure_code: charge.failure_code,
              failure_message: charge.failure_message,
            });

            paymentLogger.info(
              { ...logContext, order_id: order.id },
              "Order found and payment failed event emitted",
            );
            return { success: true, order_id: order.id };
          }
        } catch (err) {
          paymentLogger.warn(
            { ...logContext, cart_id: cartId },
            "No order found for cart_id",
          );
        }
      }

      paymentLogger.warn(
        logContext,
        "Could not find order to update for failed charge",
      );
      return { success: false, error: "Order not found" };
    } catch (error) {
      paymentLogger.error(
        {
          ...logContext,
          error: error instanceof Error ? error.message : String(error),
        },
        "Error processing charge.failed",
      );
      throw error;
    }
  }

  /**
   * Verifica que la orden de PayPal tenga al menos una captura exitosa o pendiente.
   *
   * En producción: Solo acepta COMPLETED
   * En sandbox: También acepta PENDING (PayPal sandbox deja pagos en revisión)
   *
   * NOTA: CHECKOUT.ORDER.COMPLETED no incluye captures[] en su estructura,
   * solo order.status. Por eso verificamos primero el status de la orden.
   *
   * @param paypalOrder - Objeto order de PayPal
   * @param allowPending - Si true, acepta capturas PENDING (útil para sandbox)
   */
  private hasPayPalPaymentCaptured(
    paypalOrder: PayPalOrder,
    allowPending: boolean = false,
  ): boolean {
    const captures = paypalOrder.purchase_units?.[0]?.payments?.captures || [];

    const hasCompletedCapture = captures.some(
      (capture) => capture.status === "COMPLETED",
    );

    const hasPendingCapture = captures.some(
      (capture) => capture.status === "PENDING",
    );

    // Si order.status es COMPLETED, considerar como capturado
    // (CHECKOUT.ORDER.COMPLETED no incluye captures[])
    const orderStatusCompleted = paypalOrder.status === "COMPLETED";

    const isValid =
      orderStatusCompleted ||
      hasCompletedCapture ||
      (allowPending && hasPendingCapture);

    paymentLogger.info(
      {
        paypal_order_id: paypalOrder.id,
        order_status: paypalOrder.status,
        captures_count: captures.length,
        has_completed_capture: hasCompletedCapture,
        has_pending_capture: hasPendingCapture,
        order_status_completed: orderStatusCompleted,
        allow_pending: allowPending,
        is_valid: isValid,
        capture_statuses: captures.map((c) => c.status),
        capture_details: captures.map((c) => ({
          id: c.id,
          status: c.status,
          status_details: c.status_details,
        })),
      },
      "Checking PayPal payment capture status",
    );

    return isValid;
  }

  /**
   * Maneja el evento PAYMENT.CAPTURE.PENDING de PayPal.
   * Crea una orden con payment_status "awaiting" cuando el pago está pendiente.
   *
   * @param paypalOrder - Objeto order de PayPal con datos del pago
   * @returns cart_id y order_id para tracking
   */
  async handlePayPalCapturePending(paypalOrder: PayPalOrder): Promise<{
    success: boolean;
    cart_id?: string;
    order_id?: string;
    error?: string;
  }> {
    const logContext = {
      paypal_order_id: paypalOrder.id,
      status: paypalOrder.status,
    };

    paymentLogger.info(
      logContext,
      "Processing PayPal CAPTURE.PENDING - creating order with awaiting status",
    );

    try {
      // Buscar el cart_id asociado
      const cartId = await this.findCartIdForPayPalOrder(paypalOrder);

      if (!cartId) {
        paymentLogger.error(logContext, "No cart_id found for PayPal order");
        return {
          success: false,
          error: "cart_id not found",
        };
      }

      // Verificar si ya existe una orden para este cart
      const existingOrders = await this.orderService_.list(
        { cart_id: cartId },
        { take: 1 },
      );

      if (existingOrders.length > 0) {
        paymentLogger.info(
          {
            ...logContext,
            cart_id: cartId,
            order_id: existingOrders[0].id,
          },
          "Order already exists for cart - skipping creation",
        );
        return {
          success: true,
          cart_id: cartId,
          order_id: existingOrders[0].id,
        };
      }

      // Sincronizar payment session de PayPal antes de completar
      await this.syncPayPalPaymentSession(cartId, paypalOrder);

      // Completar el carrito usando la estrategia estándar
      // NOTA: Para PENDING, el pago no tiene captured_at, resultando en payment_status 'awaiting'
      const completionToken = `paypal-pending:${paypalOrder.id}`;
      const order = await this.tryCompleteCart(cartId, completionToken);

      if (!order) {
        paymentLogger.error(
          { ...logContext, cart_id: cartId },
          "Failed to complete cart from PENDING webhook",
        );
        return {
          success: false,
          cart_id: cartId,
          error: "Cart completion failed",
        };
      }

      paymentLogger.info(
        {
          ...logContext,
          cart_id: cartId,
          order_id: order.id,
          payment_status: order.payment_status,
        },
        "Order created with awaiting payment status",
      );

      return {
        success: true,
        cart_id: cartId,
        order_id: order.id,
      };
    } catch (error) {
      paymentLogger.error(
        {
          ...logContext,
          error: error instanceof Error ? error.message : String(error),
        },
        "Error processing PayPal CAPTURE.PENDING",
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Maneja el evento PAYMENT.CAPTURE.COMPLETED de PayPal.
   * Verifica si existe una orden con payment_status "awaiting" y la actualiza a "captured".
   * Si no existe, crea una nueva orden con payment_status "captured".
   *
   * @param paypalOrder - Objeto order de PayPal con datos del pago
   * @returns cart_id, order_id y action (updated o created) para tracking
   */
  async handlePayPalCaptureCompleted(paypalOrder: PayPalOrder): Promise<{
    success: boolean;
    cart_id?: string;
    order_id?: string;
    action?: "updated" | "created";
    error?: string;
  }> {
    const logContext = {
      paypal_order_id: paypalOrder.id,
      status: paypalOrder.status,
    };

    paymentLogger.info(
      logContext,
      "Processing PayPal CAPTURE.COMPLETED - updating or creating order",
    );

    try {
      // Buscar el cart_id asociado
      const cartId = await this.findCartIdForPayPalOrder(paypalOrder);

      if (!cartId) {
        paymentLogger.error(logContext, "No cart_id found for PayPal order");
        return {
          success: false,
          error: "cart_id not found",
        };
      }

      // Verificar si ya existe una orden con payment_status "awaiting"
      const existingOrders = await this.orderService_.list(
        { cart_id: cartId },
        { relations: ["payments"], take: 1 },
      );

      paymentLogger.info(
        {
          ...logContext,
          cart_id: cartId,
          existing_orders_count: existingOrders.length,
        },
        "Searched for existing orders in handlePayPalCaptureCompleted",
      );

      if (existingOrders.length > 0) {
        const order = existingOrders[0];

        // Verificar si el pago ya está capturado
        const payment = order.payments?.[0];
        if (payment?.captured_at) {
          paymentLogger.info(
            {
              ...logContext,
              cart_id: cartId,
              order_id: order.id,
            },
            "Payment already captured - skipping update",
          );
          return {
            success: true,
            cart_id: cartId,
            order_id: order.id,
            action: "updated",
          };
        }

        // Emitir evento PAYMENT_CAPTURED - el subscriber manejará la captura
        if (payment) {
          paymentLogger.info(
            {
              ...logContext,
              cart_id: cartId,
              order_id: order.id,
              payment_id: payment.id,
              payment_captured_at: payment.captured_at,
              order_payment_status: order.payment_status,
            },
            "About to emit PAYMENT_CAPTURED event",
          );

          await this.eventBusService_.emit(
            PaymentService.Events.PAYMENT_CAPTURED,
            {
              id: payment.id,
              order_id: order.id,
            },
          );

          paymentLogger.info(
            {
              ...logContext,
              cart_id: cartId,
              order_id: order.id,
              payment_id: payment.id,
              previous_status: order.payment_status,
            },
            "✅ PAYMENT_CAPTURED event emitted successfully - order will transition from awaiting to captured",
          );
        } else {
          paymentLogger.warn(
            {
              ...logContext,
              cart_id: cartId,
              order_id: order.id,
            },
            "No payment found to emit PAYMENT_CAPTURED event",
          );
        }

        return {
          success: true,
          cart_id: cartId,
          order_id: order.id,
          action: "updated",
        };
      }

      // No existe orden, sincronizar payment session y completar el cart
      await this.syncPayPalPaymentSession(cartId, paypalOrder);

      const completionToken = `paypal-completed:${paypalOrder.id}`;
      const order = await this.tryCompleteCart(cartId, completionToken);

      if (!order) {
        paymentLogger.error(
          { ...logContext, cart_id: cartId },
          "Failed to complete cart from COMPLETED webhook",
        );
        return {
          success: false,
          cart_id: cartId,
          error: "Cart completion failed",
        };
      }

      // Emitir evento PAYMENT_CAPTURED si el pago aún no está capturado
      const orderWithPayments = await this.orderService_.retrieve(order.id, {
        relations: ["payments"],
      });
      const payment = orderWithPayments.payments?.[0];

      if (payment && !payment.captured_at) {
        await this.eventBusService_.emit(
          PaymentService.Events.PAYMENT_CAPTURED,
          {
            id: payment.id,
            order_id: order.id,
          },
        );

        paymentLogger.info(
          {
            ...logContext,
            cart_id: cartId,
            order_id: order.id,
            payment_id: payment.id,
          },
          "PAYMENT_CAPTURED event emitted for new order",
        );
      }

      paymentLogger.info(
        {
          ...logContext,
          cart_id: cartId,
          order_id: order.id,
          payment_status: order.payment_status,
        },
        "New order created with captured payment status",
      );

      return {
        success: true,
        cart_id: cartId,
        order_id: order.id,
        action: "created",
      };
    } catch (error) {
      paymentLogger.error(
        {
          ...logContext,
          error: error instanceof Error ? error.message : String(error),
        },
        "Error processing PayPal CAPTURE.COMPLETED",
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Maneja el evento CHECKOUT.ORDER.APPROVED/COMPLETED de PayPal.
   *
   * Estrategia:
   * - Verifica que el pago esté capturado (no solo aprobado)
   * - Busca el cart_id asociado a la orden de PayPal
   * - Completa el carrito usando la cart completion strategy de Medusa
   * - Usa idempotencia para evitar duplicados en reintentos del webhook
   *
   * El frontend NO completa el cart - solo hace polling para verificar
   * que el cart tenga un order_id asociado tras el webhook.
   *
   * @param paypalOrder - Objeto order de PayPal con datos del pago
   * @param requireCapture - Si true, valida que el pago esté capturado
   * @param allowPending - Si true, acepta capturas PENDING (útil para sandbox)
   * @returns cart_id y order_id para tracking
   */
  async handlePayPalCompleted(
    paypalOrder: PayPalOrder,
    requireCapture: boolean = true,
    allowPending: boolean = false,
  ): Promise<{
    success: boolean;
    cart_id?: string;
    order_id?: string;
    error?: string;
  }> {
    const logContext = {
      paypal_order_id: paypalOrder.id,
      status: paypalOrder.status,
      require_capture: requireCapture,
      allow_pending: allowPending,
    };

    paymentLogger.info(
      logContext,
      "Processing PayPal webhook - backend cart completion",
    );

    try {
      // VALIDACIÓN: Verificar que el pago esté capturado si se requiere
      if (
        requireCapture &&
        !this.hasPayPalPaymentCaptured(paypalOrder, allowPending)
      ) {
        paymentLogger.warn(
          {
            ...logContext,
            purchase_units: paypalOrder.purchase_units,
          },
          "⚠️ PayPal order not yet captured - skipping cart completion",
        );
        return {
          success: false,
          error: "Payment not captured yet",
        };
      }

      // PASO 1: Buscar el cart_id asociado a este PayPal order
      const cartId = await this.findCartIdForPayPalOrder(paypalOrder);

      if (!cartId) {
        paymentLogger.error(
          {
            ...logContext,
            purchase_units: paypalOrder.purchase_units,
            payer_email: paypalOrder.payer?.email_address,
          },
          "❌ No cart_id found for PayPal order",
        );
        return {
          success: false,
          cart_id: undefined,
          error: "No cart_id found",
        };
      }

      paymentLogger.info(
        { ...logContext, cart_id: cartId },
        "✓ Found cart_id - checking for existing order",
      );

      // PASO 2: Verificar si ya existe una orden (idempotencia)
      const existingOrders = await this.orderService_.list(
        { cart_id: cartId },
        { take: 1 },
      );

      if (existingOrders.length > 0) {
        const order = existingOrders[0];

        paymentLogger.info(
          {
            ...logContext,
            cart_id: cartId,
            order_id: order.id,
            payment_status: order.payment_status,
          },
          "✓ Order already exists (webhook retry) - checking payment status",
        );

        // Verificar si el pago está completado
        // Reglas:
        // 1. Si hay captures[] con COMPLETED = emitir evento
        // 2. Si order.status = "COMPLETED" Y NO hay captures[] = emitir evento
        // 3. Si hay captures[] con PENDING = NO emitir (esperar PAYMENT.CAPTURE.COMPLETED)
        const captures =
          paypalOrder.purchase_units?.[0]?.payments?.captures || [];
        const hasCompletedCapture = captures.some(
          (c) => c.status === "COMPLETED",
        );
        const hasPendingCapture = captures.some((c) => c.status === "PENDING");

        const isPaymentCompleted =
          hasCompletedCapture ||
          (paypalOrder.status === "COMPLETED" && captures.length === 0);

        if (isPaymentCompleted && !hasPendingCapture) {
          const orderWithPayments = await this.orderService_.retrieve(
            order.id,
            {
              relations: ["payments"],
            },
          );
          const payment = orderWithPayments.payments?.[0];

          if (payment && !payment.captured_at) {
            await this.eventBusService_.emit(
              PaymentService.Events.PAYMENT_CAPTURED,
              {
                id: payment.id,
                order_id: order.id,
              },
            );

            paymentLogger.info(
              {
                ...logContext,
                order_id: order.id,
                payment_id: payment.id,
                order_status: paypalOrder.status,
              },
              "PAYMENT_CAPTURED event emitted for existing order",
            );
          }
        } else {
          paymentLogger.info(
            {
              ...logContext,
              order_id: order.id,
              allow_pending: allowPending,
            },
            "Payment not fully captured - order remains in current state",
          );
        }

        return { success: true, cart_id: cartId, order_id: order.id };
      }

      // PASO 3: Sincronizar payment session de PayPal antes de completar
      await this.syncPayPalPaymentSession(cartId, paypalOrder);

      // PASO 4: Completar el carrito usando la cart completion strategy
      paymentLogger.info(
        { ...logContext, cart_id: cartId },
        "No existing order - completing cart from webhook",
      );

      const completionToken = `paypal:${paypalOrder.id}`;
      const order = await this.tryCompleteCart(cartId, completionToken);

      if (order?.id) {
        paymentLogger.info(
          {
            ...logContext,
            cart_id: cartId,
            order_id: order.id,
            display_id: order.display_id,
          },
          "✓ Cart completed successfully from webhook",
        );

        // Verificar si el pago está completado
        // Reglas:
        // 1. Si hay captures[] con COMPLETED = emitir evento
        // 2. Si order.status = "COMPLETED" Y NO hay captures[] = emitir evento
        // 3. Si hay captures[] con PENDING = NO emitir (esperar PAYMENT.CAPTURE.COMPLETED)
        const captures =
          paypalOrder.purchase_units?.[0]?.payments?.captures || [];
        const hasCompletedCapture = captures.some(
          (c) => c.status === "COMPLETED",
        );
        const hasPendingCapture = captures.some((c) => c.status === "PENDING");

        const isPaymentCompleted =
          hasCompletedCapture ||
          (paypalOrder.status === "COMPLETED" && captures.length === 0);

        if (isPaymentCompleted && !hasPendingCapture) {
          const orderWithPayments = await this.orderService_.retrieve(
            order.id,
            {
              relations: ["payments"],
            },
          );
          const payment = orderWithPayments.payments?.[0];

          if (payment && !payment.captured_at) {
            await this.eventBusService_.emit(
              PaymentService.Events.PAYMENT_CAPTURED,
              {
                id: payment.id,
                order_id: order.id,
              },
            );

            paymentLogger.info(
              {
                ...logContext,
                order_id: order.id,
                payment_id: payment.id,
                order_status: paypalOrder.status,
              },
              "PAYMENT_CAPTURED event emitted for completed payment",
            );
          }
        } else {
          paymentLogger.info(
            {
              ...logContext,
              order_id: order.id,
              allow_pending: allowPending,
            },
            "Payment not fully captured (PENDING) - order created in awaiting state",
          );
        }

        return { success: true, cart_id: cartId, order_id: order.id };
      }

      paymentLogger.error(
        { ...logContext, cart_id: cartId },
        "❌ Failed to complete cart from webhook",
      );
      return {
        success: false,
        cart_id: cartId,
        error: "Failed to complete cart",
      };
    } catch (error) {
      paymentLogger.error(
        {
          ...logContext,
          error: error instanceof Error ? error.message : String(error),
        },
        "Error processing PayPal webhook",
      );
      throw error;
    }
  }

  /**
   * Sincroniza la payment session de PayPal con los datos del webhook.
   * Detecta automáticamente el estado real del pago basado en:
   * 1. order.status (COMPLETED, APPROVED, etc.)
   * 2. purchase_units[].payments.captures[] (si existen)
   */
  private async syncPayPalPaymentSession(
    cartId: string,
    paypalOrder: PayPalOrder,
  ): Promise<void> {
    try {
      const cart = await this.cartService_.retrieve(cartId, {
        relations: ["payment_sessions"],
      });

      const paymentSession = cart.payment_sessions?.find(
        (session: any) => session.provider_id === "paypal",
      );

      if (!paymentSession) {
        paymentLogger.warn(
          { cart_id: cartId, paypal_order_id: paypalOrder.id },
          "No PayPal payment session found to sync",
        );
        return;
      }

      // ✅ Detectar el estado real basado en order.status Y capturas (si existen)
      const captures =
        paypalOrder.purchase_units?.[0]?.payments?.captures || [];
      const hasCompletedCapture = captures.some(
        (c) => c.status === "COMPLETED",
      );
      const hasPendingCapture = captures.some((c) => c.status === "PENDING");
      const hasDeniedCapture = captures.some(
        (c) => c.status === "DENIED" || c.status === "FAILED",
      );

      let sessionStatus: string;

      // Prioridad: Si hay capturas explícitas, usarlas primero
      if (hasCompletedCapture) {
        // Captura COMPLETED = pago autorizado
        sessionStatus = "authorized";
      } else if (hasDeniedCapture) {
        // Captura denegada = error
        sessionStatus = "error";
      } else if (hasPendingCapture) {
        // Captura pendiente = esperar confirmación
        sessionStatus = "pending";
      } else if (paypalOrder.status === "COMPLETED" && captures.length === 0) {
        // CHECKOUT.ORDER.COMPLETED sin captures[] = pago capturado
        // (este webhook no incluye captures[], solo order.status)
        sessionStatus = "authorized";
      } else if (paypalOrder.status === "APPROVED") {
        // APPROVED sin capturas = pendiente
        sessionStatus = "pending";
      } else {
        sessionStatus = "pending"; // Default seguro
      }

      // Actualizar la sesión con los datos del webhook
      const paymentSessionRepo = this.manager_.withRepository(
        PaymentSessionRepository,
      );

      await paymentSessionRepo.update(paymentSession.id, {
        data: paypalOrder as any,
        status: sessionStatus,
        is_selected: true,
      });

      paymentLogger.info(
        {
          cart_id: cartId,
          paypal_order_id: paypalOrder.id,
          session_id: paymentSession.id,
          session_status: sessionStatus,
          order_status: paypalOrder.status,
          capture_statuses: captures.map((c) => c.status),
          has_captures: captures.length > 0,
        },
        "PayPal payment session synced with correct status",
      );
    } catch (error) {
      paymentLogger.error(
        {
          cart_id: cartId,
          paypal_order_id: paypalOrder.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Error syncing PayPal payment session",
      );
      // No lanzar error, continuar con completion
    }
  }

  /**
   * Maneja el evento PAYMENT.CAPTURE.DENIED de PayPal.
   *
   * Cancela la orden si el pago fue denegado.
   */
  async handlePayPalCaptureDenied(capture: {
    id: string;
    status: string;
    status_details?: { reason?: string };
  }): Promise<{ success: boolean; order_id?: string; error?: string }> {
    const logContext = {
      capture_id: capture.id,
      event: "PAYMENT.CAPTURE.DENIED",
      status: capture.status,
      reason: capture.status_details?.reason,
    };

    paymentLogger.info(
      logContext,
      "Processing PayPal PAYMENT.CAPTURE.DENIED webhook",
    );

    try {
      // Para PayPal, necesitamos buscar la orden asociada
      // Lamentablemente PayPal no incluye el cart_id en el evento de capture
      // Por lo que necesitamos buscar por otros medios

      paymentLogger.warn(
        logContext,
        "PayPal capture denied - manual intervention may be required",
      );

      // TODO: Implementar búsqueda de orden y cancelación
      // Requiere almacenar mapping de capture_id -> order_id

      return { success: true };
    } catch (error) {
      paymentLogger.error(
        {
          ...logContext,
          error: error instanceof Error ? error.message : String(error),
        },
        "Error processing PayPal capture denied",
      );
      throw error;
    }
  }
}

export default PaymentWebhookService;
