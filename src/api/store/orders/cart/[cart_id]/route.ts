import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { OrderService } from "@medusajs/medusa";

/**
 * Custom endpoint to check if an order exists for a cart.
 * This endpoint is designed for polling scenarios where the frontend
 * waits for an order to be created after payment capture.
 * 
 * Unlike the default endpoint, this one returns 404 silently without
 * generating error logs, as "not found" is an expected state during polling.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { cart_id } = req.params;
  const orderService: OrderService = req.scope.resolve("orderService");

  try {
    const order = await orderService.retrieveByCartId(cart_id, {
      relations: [
        "billing_address",
        "shipping_address",
        "items",
        "items.variant",
        "items.variant.product",
        "shipping_methods",
        "discounts",
        "discounts.rule",
        "payments",
        "fulfillments",
        "returns",
        "gift_cards",
        "refunds",
        "region",
        "customer",
      ],
    });

    res.json({ order });
  } catch (error) {
    // Silently return 404 without logging - this is expected during polling
    if (error.type === "not_found") {
      res.status(404).json({
        message: `Order for cart ${cart_id} not found`,
        type: "not_found",
      });
      return;
    }

    // Log and return other errors normally
    console.error("Error retrieving order by cart id:", error);
    res.status(500).json({
      message: "An error occurred while retrieving the order",
      type: "server_error",
    });
  }
}
