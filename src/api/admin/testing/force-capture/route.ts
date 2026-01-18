import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { PaymentService } from "@medusajs/medusa/dist/services";


/**
 * ENDPOINT DE TESTING SOLAMENTE
 *
 * Fuerza la captura de un pago que está en estado "awaiting".
 * Útil para testing en PayPal sandbox cuando los pagos quedan en PENDING_REVIEW.
 *
 * POST /admin/testing/force-capture
 * Body: { order_id: "order_01XXX" }
 *
 * ⚠️ ELIMINAR EN PRODUCCIÓN
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { order_id } = req.body as { order_id: string };

  if (!order_id) {
    return res.status(400).json({
      error: "order_id is required",
    });
  }

  try {
    const orderService = req.scope.resolve("orderService");
    const eventBusService = req.scope.resolve("eventBusService");

    // Obtener la orden con sus payments
    const order = await orderService.retrieve(order_id, {
      relations: ["payments"],
    });

    if (!order) {
      return res.status(404).json({
        error: "Order not found",
      });
    }

    const payment = order.payments?.[0];

    if (!payment) {
      return res.status(404).json({
        error: "No payment found for this order",
      });
    }

    if (payment.captured_at) {
      return res.status(400).json({
        error: "Payment already captured",
        order_id: order.id,
        payment_status: order.payment_status,
        captured_at: payment.captured_at,
      });
    }

    // Emitir evento PAYMENT_CAPTURED - el subscriber manejará la captura
    await eventBusService.emit(PaymentService.Events.PAYMENT_CAPTURED, {
      id: payment.id,
      order_id: order.id,
    });

    // Esperar un momento para que el subscriber procese
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Obtener orden actualizada
    const updatedOrder = await orderService.retrieve(order_id, {
      relations: ["payments"],
    });

    return res.status(200).json({
      success: true,
      message: "Payment capture forced successfully",
      order_id: updatedOrder.id,
      previous_payment_status: order.payment_status,
      current_payment_status: updatedOrder.payment_status,
      captured_at: updatedOrder.payments?.[0]?.captured_at,
    });
  } catch (error) {
    console.error("Error forcing payment capture:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
