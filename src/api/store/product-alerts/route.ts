import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import ProductAlertService from "../../../services/product-alert";

interface ProductAlertBody {
  email: string;
  variant_id: string;
}

/**
 * POST /store/product-alerts
 * Subscribe to back-in-stock notifications for a product variant
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const { email, variant_id } = req.body as ProductAlertBody;

    // Validate required fields
    if (!email || !variant_id) {
      res.status(400).json({
        success: false,
        message: "Se requieren los campos 'email' y 'variant_id'",
      });
      return;
    }

    const productAlertService: ProductAlertService =
      req.scope.resolve("productAlertService");

    const result = await productAlertService.subscribe(email, variant_id);

    if (result.success) {
      res.status(201).json({
        success: true,
        message: result.message,
        subscription: result.subscription
          ? {
              id: result.subscription.id,
              email: result.subscription.email,
              variant_id: result.subscription.variant_id,
              status: result.subscription.status,
              created_at: result.subscription.created_at,
            }
          : undefined,
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error("[ProductAlerts API] POST error:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
}

/**
 * DELETE /store/product-alerts
 * Unsubscribe from back-in-stock notifications for a product variant
 */
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const { email, variant_id } = req.body as ProductAlertBody;

    // Validate required fields
    if (!email || !variant_id) {
      res.status(400).json({
        success: false,
        message: "Se requieren los campos 'email' y 'variant_id'",
      });
      return;
    }

    const productAlertService: ProductAlertService =
      req.scope.resolve("productAlertService");

    const result = await productAlertService.unsubscribe(email, variant_id);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error("[ProductAlerts API] DELETE error:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
}

/**
 * GET /store/product-alerts
 * Get subscription status for an email/variant combination
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const { email, variant_id } = req.query as {
      email?: string;
      variant_id?: string;
    };

    if (!email) {
      res.status(400).json({
        success: false,
        message: "Se requiere el parámetro 'email'",
      });
      return;
    }

    const productAlertService: ProductAlertService =
      req.scope.resolve("productAlertService");

    const subscriptions = await productAlertService.listByEmail(email);

    // Filter by variant_id if provided
    const filteredSubscriptions = variant_id
      ? subscriptions.filter((s) => s.variant_id === variant_id)
      : subscriptions;

    res.status(200).json({
      success: true,
      subscriptions: filteredSubscriptions.map((s) => ({
        id: s.id,
        email: s.email,
        variant_id: s.variant_id,
        status: s.status,
        created_at: s.created_at,
        notified_at: s.notified_at,
      })),
    });
  } catch (error) {
    console.error("[ProductAlerts API] GET error:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
}
