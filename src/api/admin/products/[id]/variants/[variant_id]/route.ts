import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";

interface VariantShippingExtraBody {
  shipping_option_price_extra?: number;
  stock_location_code?: string | null;
}

export const isValidStockLocationCode = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[A-Z](?:[1-9]|[1-9][0-9]|100)$/.test(value);

/**
 * PATCH /admin/products/:id/variants/:variant_id
 *
 * Updates shipping_option_price_extra (and optionally other variant fields)
 * for a single variant. Only accepts non-negative integer values (cents).
 */
export const PATCH = async (
  req: MedusaRequest & { body: VariantShippingExtraBody },
  res: MedusaResponse
): Promise<void> => {
  const { id: productId, variant_id } = req.params;
  const { shipping_option_price_extra, stock_location_code } = req.body;

  if (shipping_option_price_extra !== undefined) {
    if (
      typeof shipping_option_price_extra !== "number" ||
      !Number.isInteger(shipping_option_price_extra) ||
      shipping_option_price_extra < 0
    ) {
      res.status(400).json({
        error: "Validation error",
        message:
          "shipping_option_price_extra must be a non-negative integer (cents)",
      });
      return;
    }
  }

  if (
    stock_location_code !== undefined &&
    stock_location_code !== null &&
    !isValidStockLocationCode(stock_location_code)
  ) {
    res.status(400).json({
      error: "Validation error",
      message:
        "stock_location_code must be an uppercase letter followed by a number from 1 to 100",
    });
    return;
  }

  try {
    const productService = req.scope.resolve("productService") as any;

    // Verify the product exists
    await productService.retrieve(productId);

    const productVariantService = req.scope.resolve(
      "productVariantService"
    ) as any;

    const variant = await productVariantService.retrieve(variant_id);
    if (variant.product_id !== productId) {
      res.status(404).json({
        error: "Not found",
        message: `Variant ${variant_id} does not belong to product ${productId}`,
      });
      return;
    }

    const updatedVariant = await productVariantService.update(variant_id, {
      ...(shipping_option_price_extra !== undefined && {
        shipping_option_price_extra,
      }),
      ...(stock_location_code !== undefined && { stock_location_code }),
    });

    res.status(200).json({ variant: updatedVariant });
  } catch (error: any) {
    if (error.type === "not_found") {
      res.status(404).json({
        error: "Not found",
        message: error.message,
      });
      return;
    }
    throw error;
  }
};
