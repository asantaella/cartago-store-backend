import { NextFunction, Response } from "express";
import { MedusaRequest } from "@medusajs/medusa";
import {
  CartEntity,
  Manager,
  TransactionManager,
  resolveSpanishTaxService,
  resolveManager,
  getTaxContext,
  loadCartWithRelations,
  detectTerritoryChange,
  persistLineItemMetadataPrices,
  persistShippingMethodDataPrices,
  updateCartMetadata,
  log,
  logError,
  logCartOperation,
} from "./cart-pricing-helpers";

/**
 * Obtiene el carrito para validar si pertenece a una región tax-exempt
 */
async function getCartForValidation(
  manager: Manager,
  cartId: string,
): Promise<CartEntity | null> {
  try {
    let cart: CartEntity | null = null;

    await manager.transaction(async (tm: TransactionManager) => {
      cart = await loadCartWithRelations(tm, cartId, [
        "shipping_address",
        "region",
        "items",
        "shipping_methods",
      ]);
    });

    return cart;
  } catch {
    return null;
  }
}

/**
 * Middleware que persiste los precios ajustados en metadata para zonas tax-exempt
 * en las peticiones POST/PATCH del carrito.
 * Detecta cambios de zona fiscal y restaura o ajusta precios según corresponda.
 */
export async function adjustCartPricingOnPost(
  req: MedusaRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const cartId = req.params?.id as string | undefined;
    if (!cartId) {
      next();
      return;
    }

    // Excluir explícitamente el endpoint COMPLETE
    const requestPath = req.originalUrl || req.path || "";
    const isCompleteEndpoint = /\/store\/carts\/[^/]+\/complete\/?$/.test(
      requestPath,
    );
    if (isCompleteEndpoint) {
      next();
      return;
    }

    const manager = resolveManager(req);

    if (!manager) {
      next();
      return;
    }

    const spanishTaxService = resolveSpanishTaxService(req);

    if (!spanishTaxService) {
      next();
      return;
    }

    // Obtener el carrito completo para verificar cambios de zona
    const currentCart = await getCartForValidation(manager, cartId);
    if (!currentCart) {
      next();
      return;
    }

    const taxContext = getTaxContext(currentCart, spanishTaxService);
    if (!taxContext) {
      next();
      return;
    }

    // Detectar si ha habido un cambio de zona fiscal
    const { hasChanged, previouslyTaxExempt } = detectTerritoryChange(
      currentCart,
      taxContext,
    );

    logCartOperation("POST", cartId, {
      postal: taxContext.postalCode,
      isTaxExempt: taxContext.isTaxExempt,
      territory: taxContext.territoryType,
      territoryChanged: hasChanged,
      previouslyTaxExempt: previouslyTaxExempt,
    });

    // Ejecutar transacción para ajustar o restaurar precios
    await manager.transaction(async (tm: TransactionManager) => {
      const cart = await loadCartWithRelations(tm, cartId);
      if (!cart) return;

      let itemsUpdated = 0;
      let shippingUpdated = 0;

      // CASO 1: Cambio de tax-exempt a standard (dejar que DB-UPDATE restaure)
      if (hasChanged && previouslyTaxExempt && !taxContext.isTaxExempt) {
        log(`Territory change detected: tax-exempt -> standard`);
        // NO restaurar aquí, dejar que adjustCartPricesInDb lo haga
      }
      // CASO 2: Cambio de standard a tax-exempt O permanece tax-exempt (persistir metadata)
      else if (taxContext.isTaxExempt) {
        if (hasChanged && !previouslyTaxExempt) {
          log(`Territory change detected: standard -> tax-exempt`);
        }

        // Persistir precios ajustados en items (guarda original si no existe)
        if (Array.isArray(cart.items) && cart.items.length > 0) {
          itemsUpdated = await persistLineItemMetadataPrices(tm, cart.items);
        }

        // Persistir precios ajustados en shipping methods
        if (
          Array.isArray(cart.shipping_methods) &&
          cart.shipping_methods.length > 0
        ) {
          shippingUpdated = await persistShippingMethodDataPrices(
            tm,
            cart.shipping_methods,
          );
        }

        if (itemsUpdated > 0 || shippingUpdated > 0) {
          log(
            `Persisted prices metadata: ${itemsUpdated} items, ${shippingUpdated} shipping`,
          );
        }
      }

      // Actualizar metadata del territorio
      await updateCartMetadata(tm, cartId, taxContext.territoryType, false);
    });

    // Sincronizar BD SOLO cuando hay cambio de territorio o está en zona tax-exempt
    // Esto evita ajustes innecesarios en zonas standard sin cambios
    if (hasChanged || taxContext.isTaxExempt) {
      const manager2 = resolveManager(req);
      if (manager2) {
        const { adjustCartPricesInDb } =
          await import("./cart-pricing-db-update");
        adjustCartPricesInDb(manager2, cartId, taxContext).catch((err) =>
          log(`DB sync error in POST for cart ${cartId}: ${err}`),
        );
      }
    }

    next();
  } catch (error) {
    logError("Error in adjustCartPricingOnPost", error);
    next();
  }
}
