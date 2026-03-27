import {
  Manager,
  TransactionManager,
  LineItemEntity,
  ShippingMethodEntity,
  loadCartWithRelations,
  getAdjustedPrice,
  isValidPrice,
  updateCartMetadata,
  log,
} from "./cart-pricing-helpers";

/**
 * Ajusta los precios del carrito en la base de datos según la zona fiscal.
 * Si isTaxExempt=true: Aplica precios ajustados sin IVA y guarda el original
 * Si isTaxExempt=false: Restaura los precios originales si existen
 */
export async function adjustCartPricesInDb(
  manager: Manager,
  cartId: string,
  taxContext: {
    isTaxExempt: boolean;
    postalCode: string;
    territoryType: string;
  }
): Promise<void> {
  const { isTaxExempt, territoryType } = taxContext;

  await manager.transaction(async (tm: TransactionManager) => {
    const cart = await loadCartWithRelations(tm, cartId);
    if (!cart) return;

    let itemsUpdated = 0;
    let shippingUpdated = 0;

    // Actualizar Items
    if (Array.isArray(cart.items) && cart.items.length > 0) {
      for (const item of cart.items) {
        if (!isValidPrice(item.unit_price)) continue;

        if (!item.metadata) item.metadata = {};

        let originalPrice = item.metadata.original_unit_price as number;
        let targetPrice: number;

        if (isTaxExempt) {
          // ZONA TAX-EXEMPT: Guardar original y aplicar precio ajustado
          if (originalPrice === undefined) {
            // Primera vez que se ajusta: el unit_price actual es el original con IVA
            originalPrice = item.unit_price;
            item.metadata.original_unit_price = originalPrice;
            log(
              `DB Update: item ${item.id} stored original price: ${originalPrice} cents`
            );
          }
          targetPrice = getAdjustedPrice(originalPrice);
          item.metadata.adjusted_unit_price = targetPrice;
        } else {
          // ZONA STANDARD: Restaurar precio original si existe
          if (originalPrice !== undefined) {
            targetPrice = originalPrice;
            // NO borrar original_unit_price, mantenerlo como referencia permanente
            // Solo borrar adjusted_unit_price
            delete item.metadata.adjusted_unit_price;
          } else {
            // No hay precio original guardado, mantener el actual
            targetPrice = item.unit_price;
          }
        }

        // Aplicar cambio si es necesario
        if (item.unit_price !== targetPrice) {
          log(
            `DB Update: item ${item.id} price: ${item.unit_price} -> ${targetPrice} ` +
              `(Exempt: ${isTaxExempt}, Original: ${originalPrice || "none"})`
          );
          item.unit_price = targetPrice;

          const repo = tm.getRepository<LineItemEntity>("LineItem");
          await repo.save(item);
          itemsUpdated++;
        }
      }
    }

    // Actualizar Shipping Methods
    if (
      Array.isArray(cart.shipping_methods) &&
      cart.shipping_methods.length > 0
    ) {
      for (const method of cart.shipping_methods) {
        if (!method.data) method.data = {};

        let originalPrice = method.data.original_price as number;
        let targetPrice: number;

        if (isTaxExempt) {
          // ZONA TAX-EXEMPT: Guardar original y aplicar precio ajustado
          if (originalPrice === undefined) {
            // Primera vez que se ajusta: el price actual es el original SIN el extra de variante
            // (el extra se gestiona por separado en shipping_extra_total)
            const existingExtra = (method.data.shipping_extra_total as number) ?? 0;
            originalPrice = method.price - existingExtra;
            method.data.original_price = originalPrice;
            log(
              `DB Update: shipping ${method.id} stored original price: ${originalPrice} cents ` +
                `(price=${method.price}, extra=${existingExtra})`
            );
          }
          const existingExtra = (method.data.shipping_extra_total as number) ?? 0;
          targetPrice = getAdjustedPrice(originalPrice) + existingExtra;
          method.data.adjusted_price = getAdjustedPrice(originalPrice);
        } else {
          // ZONA STANDARD: Restaurar precio original si existe
          if (originalPrice !== undefined) {
            const existingExtra = (method.data.shipping_extra_total as number) ?? 0;
            targetPrice = originalPrice + existingExtra;
            // NO borrar original_price, mantenerlo como referencia permanente
            // Solo borrar adjusted_price
            delete method.data.adjusted_price;
          } else {
            // No hay precio original guardado, mantener el actual
            targetPrice = method.price;
          }
        }

        if (method.price !== targetPrice) {
          log(
            `DB Update: shipping ${method.id} price: ${method.price} -> ${targetPrice} ` +
              `(Exempt: ${isTaxExempt}, Original: ${originalPrice || "none"})`
          );
          method.price = targetPrice;

          const repo = tm.getRepository<ShippingMethodEntity>("ShippingMethod");
          await repo.save(method);
          shippingUpdated++;
        }
      }
    }

    // Actualizar metadata del cart
    await updateCartMetadata(tm, cartId, territoryType, false);

    if (itemsUpdated > 0 || shippingUpdated > 0) {
      log(
        `Synced DB for cart ${cartId}: Updated ${itemsUpdated} items and ${shippingUpdated} shipping methods ` +
          `(Tax Exempt: ${isTaxExempt})`
      );
    }
  });
}
