import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const paypalService = req.scope.resolve("paypalProviderService");
  const manager = req.scope.resolve("manager");
  const cartService = req.scope.resolve("cartService");
  const orderService = req.scope.resolve("orderService");

  // Verificar firma del webhook
  try {
    await paypalService.verifyWebhook({
      auth_algo: req.headers["paypal-auth-algo"],
      cert_url: req.headers["paypal-cert-url"],
      transmission_id: req.headers["paypal-transmission-id"],
      transmission_sig: req.headers["paypal-transmission-sig"],
      transmission_time: req.headers["paypal-transmission-time"],
      webhook_event: req.body,
    });
  } catch {
    return res.sendStatus(401);
  }

  try {
    const { event_type, resource } = req.body as any;

    // FIX: Detectar si es CAPTURE o AUTHORIZATION
    if (event_type === "PAYMENT.CAPTURE.COMPLETED") {
      // Para CAPTURE, usar el order_id del supplementary_data
      const orderId = resource.supplementary_data?.related_ids?.order_id;
      if (!orderId) return res.sendStatus(200);

      // Recuperar la orden usando retrievePayment (que acepta order_id)
      const order = await paypalService.retrievePayment({ id: orderId });
      const customId = order.purchase_units?.[0]?.custom_id;
      if (!customId) return res.sendStatus(200);

      // Completar el cart
      await manager.transaction(async (m) => {
        const cart = await cartService.withTransaction(m).retrieve(customId);
        
        // Verificar si ya está completado
        if (cart.completed_at) {
          console.log(`Cart ${customId} ya estaba completado`);
          return;
        }

        await cartService.withTransaction(m).setPaymentSession(customId, "paypal");
        await cartService.withTransaction(m).authorizePayment(customId);
        await orderService.withTransaction(m).createFromCart(customId);
      });

      return res.sendStatus(200);
    }

    // AUTHORIZATION flow (original)
    if (event_type === "PAYMENT.AUTHORIZATION.CREATED") {
      const authId = resource.id;
      const auth = await paypalService.retrieveAuthorization(authId);
      const order = await paypalService.retrieveOrderFromAuth(auth);
      if (!order) return res.sendStatus(200);

      const customId = order.purchase_units[0].custom_id;
      if (!customId) return res.sendStatus(200);

      await manager.transaction(async (m) => {
        const cart = await cartService.withTransaction(m).retrieve(customId);
        if (cart.completed_at) return;

        await cartService.withTransaction(m).setPaymentSession(customId, "paypal");
        await cartService.withTransaction(m).authorizePayment(customId);
        await orderService.withTransaction(m).createFromCart(customId);
      });

      return res.sendStatus(200);
    }

    // Otros eventos - ignorar
    console.log(`PayPal webhook event ignorado: ${event_type}`);
    res.sendStatus(200);
  } catch (err) {
    console.error("PayPal webhook error:", err);
    res.sendStatus(200); // Retornar 200 para evitar reintentos
  }
}
