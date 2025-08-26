import { LineItem, ShippingMethod } from "@medusajs/medusa";

/**
 * Verifica si un código postal pertenece a un territorio con exención de IVA
 * (Canarias, Ceuta, Melilla)
 */
function isTaxExemptTerritory(postalCode?: string): boolean {
  if (!postalCode) return false;

  const cleanPostal = postalCode.replace(/\s/g, "");

  // Canarias: 35xxx (Las Palmas), 38xxx (Santa Cruz de Tenerife)
  // Ceuta: 51xxx
  // Melilla: 52xxx
  return /^(35|38|51|52)\d{3}$/.test(cleanPostal);
}

/**
 * Obtiene el tipo de territorio basado en el código postal
 */
function getTerritoryType(postalCode?: string): string {
  if (!postalCode) return "standard";

  const cleanPostal = postalCode.replace(/\s/g, "");

  if (/^35\d{3}$/.test(cleanPostal) || /^38\d{3}$/.test(cleanPostal)) {
    return "canarias";
  }
  if (/^51\d{3}$/.test(cleanPostal)) {
    return "ceuta";
  }
  if (/^52\d{3}$/.test(cleanPostal)) {
    return "melilla";
  }

  return "standard";
}

export async function restoreOriginalPrices(
  container: any,
  cartId: string
): Promise<boolean> {
  try {
    const cartService = container.resolve("cartService");
    const manager = container.resolve("manager");

    // Get cart directly from database using manager to avoid cache issues
    const cartRepo = manager.getRepository("Cart");
    const cart = await cartRepo.findOne({
      where: { id: cartId },
      relations: [
        "items",
        "items.variant",
        "items.variant.prices",
        "shipping_address",
        "shipping_methods",
        "shipping_methods.shipping_option",
      ],
    });

    const postal = cart?.shipping_address?.postal_code;
    const territoryType = getTerritoryType(postal);
    console.log(
      `[TaxExemptPersistence] Restoring prices for cart ${cartId} with postal ${postal} (${territoryType})`
    );

    let updated = false;

    // Restore line items to original prices from variant.prices (with tax included)
    if (Array.isArray(cart.items)) {
      console.log(
        `[TaxExemptPersistence] Processing ${cart.items.length} items for restoration`
      );
      for (const item of cart.items) {
        try {
          const originalPrice = item.variant?.prices?.find(
            (p) => p.currency_code === "eur"
          )?.amount;

          console.log(
            `[TaxExemptPersistence] Item ${item.id}: current=${item.unit_price}, original=${originalPrice}, variant_id=${item.variant?.id}`
          );

          if (typeof originalPrice === "number" && isFinite(originalPrice)) {
            // Para península: restaurar al precio original de la variante (CON IVA incluido)
            // El originalPrice es el precio completo del producto que incluye IVA
            if (item.unit_price !== originalPrice) {
              console.log(
                `[TaxExemptPersistence] *** RESTORING item ${item.id} unit_price := ${originalPrice} (WITH TAX, current=${item.unit_price}) ***`
              );
            
              const lineItemRepo = manager.getRepository(LineItem);
              await lineItemRepo.update(item.id, { unit_price: originalPrice });
              updated = true;
              console.log(
                `[TaxExemptPersistence] *** RESTORATION COMPLETE for item ${item.id} - Price restored to ${originalPrice} cents ***`
              );
            }
          }
        } catch (itemError) {
          console.warn(
            `[TaxExemptPersistence] Error restoring item ${item.id}:`,
            itemError.message
          );
        }
      }
    } else {
      console.warn(
        `[TaxExemptPersistence] cart.items is not an array: ${typeof cart.items}`
      );
    }

    // Restore shipping methods to original prices from shipping_option.amount (with tax included)
    if (Array.isArray(cart.shipping_methods)) {
      for (const sm of cart.shipping_methods) {
        try {
          const originalPrice = sm?.shipping_option?.amount;
          if (typeof originalPrice === "number" && isFinite(originalPrice)) {
            if (sm.price !== originalPrice) {
              console.log(
                `[TaxExemptPersistence] Restoring shipping method ${sm.id} price := ${originalPrice} (current=${sm.price})`
              );
              const shippingMethodRepo = manager.getRepository(ShippingMethod);
              await shippingMethodRepo.update(sm.id, { price: originalPrice });
              updated = true;
            }
          }
        } catch (shippingError) {
          console.warn(
            `[TaxExemptPersistence] Error restoring shipping method ${sm.id}:`,
            shippingError.message
          );
        }
      }
    }

    if (updated) {
      console.log(
        `[TaxExemptPersistence] Successfully restored original prices for cart ${cartId}`
      );
    }

    return true;
  } catch (error) {
    console.error(
      `[TaxExemptPersistence] Error restoring prices for cart ${cartId}:`,
      error.message
    );
    return false;
  }
}

export async function persistTaxExemptPrices(
  container: any,
  cartId: string
): Promise<boolean> {
  console.log(`[TaxExemptPersistence] Starting persistence for cart ${cartId}`);

  try {
    const cartService = container.resolve("cartService");
    const manager = container.resolve("manager");

    // Get cart directly from database using manager to avoid cache issues
    const cartRepo = manager.getRepository("Cart");
    const cart = await cartRepo.findOne({
      where: { id: cartId },
      relations: [
        "items",
        "items.variant",
        "items.variant.prices",
        "shipping_address",
        "shipping_methods",
        "shipping_methods.shipping_option",
      ],
    });

    const postal = cart?.shipping_address?.postal_code;
    const territoryType = getTerritoryType(postal);
    const isTaxExempt = isTaxExemptTerritory(postal);

    if (!isTaxExempt) {
      console.log(
        `[TaxExemptPersistence] *** NOT TAX EXEMPT - postal: "${postal}", territory: "${territoryType}" - calling restoreOriginalPrices ***`
      );
 
      const result = await restoreOriginalPrices(container, cartId);
      console.log(
        `[TaxExemptPersistence] *** restoreOriginalPrices returned: ${result} ***`
      );
      return result;
    }

    // Do not short-circuit on metadata flags; persistence is idempotent now

    console.log(
      `[TaxExemptPersistence] Processing tax-exempt cart ${cartId} with postal ${postal} (${territoryType})`
    );

    let updated = false;

    // Update line items (idempotent): use variant.prices[EUR] as base; skip if missing
    if (Array.isArray(cart.items)) {
      for (const item of cart.items) {
        const base = item.variant?.prices?.find(
          (p) => p.currency_code === "eur"
        )?.amount;

        if (typeof base === "number" && isFinite(base)) {
          const converted = Math.round(base / 1.21);
          const lineItemRepo = manager.getRepository(LineItem);
          await lineItemRepo.update(item.id, { unit_price: converted });
          updated = true;
        }
      }
    }

    // Update shipping methods (idempotent): use shipping_option.amount as base; skip if missing
    if (Array.isArray(cart.shipping_methods)) {
      for (const sm of cart.shipping_methods) {
        const base = sm?.shipping_option?.amount;
        if (typeof base === "number" && isFinite(base)) {
          const converted = Math.round(base / 1.21);
          const shippingMethodRepo = manager.getRepository(ShippingMethod);
          await shippingMethodRepo.update(sm.id, { price: converted });
          updated = true;
        }
      }
    }

    if (updated) {
      console.log(
        `[TaxExemptPersistence] Successfully persisted updates for cart ${cartId} (${territoryType})`
      );
    }

    return true;
  } catch (error) {
    console.error(
      `[TaxExemptPersistence] Error for cart ${cartId}:`,
      error.message
    );
    return false;
  }
}
