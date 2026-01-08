import { NextFunction, Response } from "express";
import { MedusaRequest } from "@medusajs/medusa";
import {
  CartEntity,
  LineItemEntity,
  ShippingMethodEntity,
  Manager,
  TransactionManager,
  resolveSpanishTaxService,
  resolveManager,
  getTaxContext,
  isValidPrice,
  getAdjustedPrice,
  loadCartWithRelations,
  updateShippingMethodData,
  updateCartMetadata,
  log,
  logError,
  logCartOperation,
} from "./cart-pricing-helpers";

/**
 * Obtiene el carrito para validar si pertenece a una región tax-exempt
 * antes de iniciar la transacción principal
 */
async function getCartForValidation(
  manager: Manager,
  cartId: string
): Promise<CartEntity | null> {
  try {
    let cart: CartEntity | null = null;

    await manager.transaction(async (tm: TransactionManager) => {
      cart = await loadCartWithRelations(tm, cartId, [
        "shipping_address",
        "region",
      ]);
    });

    return cart;
  } catch {
    return null;
  }
}

/**
 * Persiste los precios ajustados en metadata para todos los line items
 */
async function persistLineItemPrices(
  transactionalManager: TransactionManager,
  items: LineItemEntity[]
): Promise<number> {
  let updatedCount = 0;

  for (const item of items) {
    if (!isValidPrice(item.unit_price)) continue;

    const adjustedPrice = getAdjustedPrice(item.unit_price);

    // También guardar el descuento original en metadata para uso posterior en COMPLETE
    const originalDiscount = item.discount_total || 0;

    // Actualizar metadata con precio ajustado y descuento original
    if (!item.metadata) {
      item.metadata = {};
    }
    item.metadata.adjusted_unit_price = adjustedPrice;
    if (originalDiscount > 0) {
      item.metadata.original_discount_total = originalDiscount;
    }

    const repo = transactionalManager.getRepository<LineItemEntity>("LineItem");
    await repo.save(item);

    updatedCount++;
    log(
      `POST item ${item.id} - adjusted_unit_price: ${adjustedPrice} cents (${(
        adjustedPrice / 100
      ).toFixed(2)}€), original_discount: ${originalDiscount} cents`
    );
    log(
      `POST item ${item.id} - metadata persisted: ${JSON.stringify(
        item.metadata
      )}`
    );
  }

  return updatedCount;
}

/**
 * Persiste los precios ajustados en data para todos los shipping methods
 */
async function persistShippingMethodPrices(
  transactionalManager: TransactionManager,
  methods: ShippingMethodEntity[]
): Promise<number> {
  let updatedCount = 0;

  for (const method of methods) {
    if (!isValidPrice(method.price)) continue;

    const adjustedPrice = getAdjustedPrice(method.price);
    const updated = await updateShippingMethodData(
      transactionalManager,
      method.id,
      adjustedPrice
    );

    if (updated) {
      updatedCount++;
      log(
        `POST shipping ${
          method.id
        } - adjusted_price: ${adjustedPrice} cents (${(
          adjustedPrice / 100
        ).toFixed(2)}€)`
      );
    }
  }

  return updatedCount;
}

/**
 * Middleware que persiste los precios ajustados en metadata para zonas tax-exempt
 * en las peticiones POST/PATCH del carrito.
 * IMPORTANTE: NO modifica unit_price original, solo guarda el precio ajustado en metadata
 */
export async function adjustCartPricingOnPost(
  req: MedusaRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const cartId = req.params?.id as string | undefined;
    if (!cartId) {
      next();
      return;
    }

    // Excluir explícitamente el endpoint COMPLETE para que solo se ejecute
    // persistCartPricingOnComplete en esa ruta (punto 1 del análisis anterior)
    const requestPath = req.originalUrl || req.path || "";
    const isCompleteEndpoint = /\/store\/carts\/[^/]+\/complete\/?$/.test(
      requestPath
    );
    if (isCompleteEndpoint) {
      next();
      return;
    }

    const spanishTaxService = resolveSpanishTaxService(req);
    const manager = resolveManager(req);

    if (!spanishTaxService || !manager) {
      next();
      return;
    }

    // Verificar si es una región tax-exempt ANTES de iniciar la transacción
    const tempCart = await getCartForValidation(manager, cartId);
    if (!tempCart) {
      next();
      return;
    }

    const taxContext = getTaxContext(tempCart, spanishTaxService);
    if (!taxContext || !taxContext.isTaxExempt) {
      next();
      return;
    }

    logCartOperation("POST", cartId, {
      postal: taxContext.postalCode,
      isTaxExempt: taxContext.isTaxExempt,
      territory: taxContext.territoryType,
    });

    // Ejecutar transacción para persistir precios
    await manager.transaction(async (tm: TransactionManager) => {
      const cart = await loadCartWithRelations(tm, cartId);
      if (!cart) return;

      // Persistir precios ajustados en items
      if (Array.isArray(cart.items) && cart.items.length > 0) {
        await persistLineItemPrices(tm, cart.items);
      }

      // Persistir precios ajustados en shipping methods
      if (
        Array.isArray(cart.shipping_methods) &&
        cart.shipping_methods.length > 0
      ) {
        await persistShippingMethodPrices(tm, cart.shipping_methods);
      }

      // IMPORTANTE: No marcar prices_adjusted aquí
      // Solo debe marcarse en COMPLETE después de persistir finalmente
      // Aquí solo actualizamos el territorio
      await updateCartMetadata(tm, cartId, taxContext.territoryType, false);
    });

    next();
  } catch (error) {
    logError("Error in adjustCartPricingOnPost", error);
    next();
  }
}
