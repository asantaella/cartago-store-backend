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

        // Asegurar que tenemos el precio original
        if (!item.metadata) item.metadata = {};

        let originalPrice = item.metadata.original_unit_price as number;
        if (originalPrice === undefined) {
          originalPrice = item.unit_price;
          item.metadata.original_unit_price = originalPrice;
        }

        // Calcular target price
        let targetPrice = originalPrice;
        if (isTaxExempt) {
          targetPrice = getAdjustedPrice(originalPrice);
        }

        // Aplicar cambio si es necesario
        if (item.unit_price !== targetPrice) {
          log(
            `DB Update: item ${item.id} price: ${item.unit_price} -> ${targetPrice} (Exempt: ${isTaxExempt})`
          );
          item.unit_price = targetPrice;
          item.metadata.adjusted_unit_price = targetPrice;

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
        if (originalPrice === undefined) {
          originalPrice = method.price;
          method.data.original_price = originalPrice;
        }

        let targetPrice = originalPrice;
        if (isTaxExempt) {
          targetPrice = getAdjustedPrice(originalPrice);
        }

        if (method.price !== targetPrice) {
          log(
            `DB Update: shipping ${method.id} price: ${method.price} -> ${targetPrice} (Exempt: ${isTaxExempt})`
          );
          method.price = targetPrice;
          method.data.adjusted_price = targetPrice;

          const repo = tm.getRepository<ShippingMethodEntity>("ShippingMethod");
          await repo.save(method);
          shippingUpdated++;
        }
      }
    }

    // Actualizar metadata del cart
    await updateCartMetadata(tm, cartId, territoryType, false);
    
    if (itemsUpdated > 0 || shippingUpdated > 0) {
        log(`Synced DB for cart ${cartId}: Updated ${itemsUpdated} items and ${shippingUpdated} shipping methods.`);
    }
  });
}
