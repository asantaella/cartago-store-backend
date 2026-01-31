import PaypalProvider from "../../../services/paypal-provider"

export default async (req, res) => {
  const auth_algo = req.headers["paypal-auth-algo"]
  const cert_url = req.headers["paypal-cert-url"]
  const transmission_id = req.headers["paypal-transmission-id"]
  const transmission_sig = req.headers["paypal-transmission-sig"]
  const transmission_time = req.headers["paypal-transmission-time"]

  const paypalService: PaypalProvider = req.scope.resolve(
    "paypalProviderService"
  )

  try {
    await paypalService.verifyWebhook({
      auth_algo,
      cert_url,
      transmission_id,
      transmission_sig,
      transmission_time,
      webhook_event: req.body,
    })
  } catch (err) {
    res.sendStatus(401)
    return
  }

  function isPaymentCollection(id) {
    return id && id.startsWith("paycol")
  }

  async function autorizeCart(req, cartId, isCapture = false) {
    const manager = req.scope.resolve("manager")
    const cartService = req.scope.resolve("cartService")
    const swapService = req.scope.resolve("swapService")
    const orderService = req.scope.resolve("orderService")

    // First, check if order already exists (idempotency check)
    const existingOrder = await orderService
      .retrieveByCartId(cartId, { relations: ["payments"] })
      .catch((_) => undefined)

    if (existingOrder) {
      console.log(`Order ${existingOrder.id} already exists for cart ${cartId}`)
      
      // If capture mode and payment not yet captured, capture it
      if (isCapture && existingOrder.payment_status === "awaiting") {
        console.log(`Capturing payment for existing order ${existingOrder.id}`)
        await orderService.capturePayment(existingOrder.id)
        console.log(`Payment captured successfully for order ${existingOrder.id}`)
      }
      return
    }

    await manager.transaction(async (m) => {
      const cart = await cartService.withTransaction(m).retrieve(cartId, {
        relations: ["items", "items.variant", "payment_sessions", "region"]
      })

      // Verify cart has items and valid total
      console.log(`Cart ${cartId} status:`, {
        itemCount: cart.items?.length || 0,
        total: cart.total,
        subtotal: cart.subtotal,
        paymentSessions: cart.payment_sessions?.length || 0,
        completedAt: cart.completed_at
      })

      // Don't process if cart is already completed
      if (cart.completed_at) {
        console.log(`Cart ${cartId} already completed at ${cart.completed_at}, skipping`)
        return
      }

      // Don't process if cart has no items
      if (!cart.items || cart.items.length === 0) {
        console.log(`Cart ${cartId} has no items, skipping`)
        return
      }

      switch (cart.type) {
        case "swap": {
          const swap = await swapService
            .withTransaction(m)
            .retrieveByCartId(cartId)
            .catch((_) => undefined)

          if (swap && swap.confirmed_at === null) {
            await cartService
              .withTransaction(m)
              .setPaymentSession(cartId, "paypal")
            await cartService.withTransaction(m).authorizePayment(cartId)
            await swapService.withTransaction(m).registerCartCompletion(swap.id)
          }
          break
        }

        default: {
          await cartService
            .withTransaction(m)
            .setPaymentSession(cartId, "paypal")
          await cartService.withTransaction(m).authorizePayment(cartId)
          
          console.log(`Creating order from cart ${cartId} with total: ${cart.total}`)
          await orderService.withTransaction(m).createFromCart(cartId)
          console.log(`Order created successfully from cart ${cartId}`)
          break
        }
      }
    })

    // If payment was captured in PayPal, capture it in the order
    if (isCapture) {
      const order = await orderService.retrieveByCartId(cartId)
      
      if (order && order.payment_status === "awaiting") {
        console.log(`Capturing payment for order ${order.id}`)
        await orderService.capturePayment(order.id)
        console.log(`Payment captured successfully for order ${order.id}`)
      }
    }
  }

  async function autorizePaymentCollection(req, id, orderId) {
    const manager = req.scope.resolve("manager")
    const paymentCollectionService = req.scope.resolve(
      "paymentCollectionService"
    )

    await manager.transaction(async (manager) => {
      await paymentCollectionService.withTransaction(manager).authorize(id)
    })
  }

  try {
    const body = req.body
    const eventType = body.event_type
    const resourceId = body.resource.id
    const resourceType = body.resource_type

    console.log("PayPal webhook received:", {
      eventType,
      resourceId,
      resourceType,
    })

    let order
    let isCapture = false

    // For capture mode, only process PAYMENT.CAPTURE.COMPLETED
    // CHECKOUT.ORDER.APPROVED arrives before capture, so we ignore it
    if (eventType === "CHECKOUT.ORDER.APPROVED" && resourceType === "checkout-order") {
      console.log("Ignoring CHECKOUT.ORDER.APPROVED - waiting for CAPTURE event")
      res.sendStatus(200)
      return
    }

    // Handle different resource types
    if (eventType && eventType.includes("CAPTURE")) {
      // For capture events (when capture: true)
      console.log("Processing as CAPTURE event")
      isCapture = true
      const paymentResource = await paypalService.retrieveCapture(resourceId)
      console.log("Capture resource retrieved:", paymentResource)
      order = await paypalService.retrieveOrderFromCapture(paymentResource)
      console.log("Order from capture:", JSON.stringify(order, null, 2))
    } else {
      // For authorization events (when capture: false)
      console.log("Processing as AUTHORIZATION event")
      const paymentResource = await paypalService.retrieveAuthorization(resourceId)
      order = await paypalService.retrieveOrderFromAuth(paymentResource)
    }

    if (!order) {
      console.log("No order found, returning 200")
      res.sendStatus(200)
      return
    }

    const purchaseUnit = order.purchase_units[0]
    const customId = purchaseUnit.custom_id || purchaseUnit.reference_id

    console.log("Order details:", {
      orderId: order.id,
      customId,
      referenceId: purchaseUnit.reference_id,
      status: order.status,
    })

    if (!customId) {
      console.log("No customId found, returning 200")
      res.sendStatus(200)
      return
    }

    if (isPaymentCollection(customId)) {
      const orderId = order.id
      console.log("Authorizing payment collection:", customId)
      await autorizePaymentCollection(req, customId, orderId)
    } else {
      const action = isCapture ? "Capturing" : "Authorizing"
      console.log(`${action} cart:`, customId)
      try {
        await autorizeCart(req, customId, isCapture)
        console.log("Cart authorization completed successfully")
      } catch (authError) {
        console.error("Error during cart authorization:", authError)
        throw authError
      }
    }

    console.log("Webhook processing completed successfully")
    res.sendStatus(200)
  } catch (err) {
    console.error("Webhook handler error:", err)
    res.sendStatus(409)
  }
}
