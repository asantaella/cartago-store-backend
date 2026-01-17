import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";

/**
 * GET /store/orders/cart/:cart_id
 *
 * Endpoint tolerant for frontend polling: returns 200 with { order_id: null }
 * instead of a 404 when no order exists yet, to avoid noisy server errors.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { cart_id } = req.params as { cart_id: string };

  try {
    const orderService = req.scope.resolve("orderService");

    const orders = await orderService.list({ cart_id }, { take: 1 });

    if (orders && orders.length > 0) {
      const order = orders[0];
      return res.status(200).json({ order_id: order.id, order });
    }

    // Return 200 with null so frontend polling doesn't cause server errors
    return res.status(200).json({ order_id: null });
  } catch (error) {
    console.error("Error fetching order by cart id:", cart_id, error);
    return res.status(500).json({ error: "Internal error" });
  }
};

export const OPTIONS = async (req: MedusaRequest, res: MedusaResponse) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  return res.status(204).send();
};
