import { MedusaRequest } from "@medusajs/medusa";
import { NextFunction, Response } from "express";
import {
  applyTaxExemptTransformations,
  calculateShippingTotal,
  CartEntity,
  extractCartFromBody,
  getTaxContext,
  loadCartWithRelations,
  log,
  logError,
  resolveManager,
  resolveSpanishTaxService,
  ShippingMethodEntity,
  TransactionManager,
  calculateShippingExtra,
  Manager,
} from "./cart-pricing-helpers";

/**
 * Middleware independiente para sincronizar el recargo extra de envío
 * derivado de variant.shipping_option_price_extra en respuestas POST/PATCH del cart.
 */
export async function adjustCartShippingExtraOnPost(
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

    const originalJson = res.json.bind(res);

    res.json = function (body: unknown) {
      syncCartResponseAfterMutation(req, manager, cartId, body)
        .then((updatedBody) => originalJson(updatedBody))
        .catch((error) => {
          logError("Error syncing cart shipping extra response", error);
          return originalJson(body);
        });

      return res as unknown as Response;
    };

    next();
  } catch (error) {
    logError("Error in adjustCartShippingExtraOnPost", error);
    next();
  }
}

export async function syncShippingExtraAfterMutation(
  manager: Manager,
  cartId: string,
): Promise<CartEntity | null> {
  let syncedCart: CartEntity | null = null;

  await manager.transaction(async (tm: TransactionManager) => {
    const cart = await loadCartWithRelations(tm, cartId, [
      "items",
      "items.variant",
      "shipping_methods",
      "shipping_address",
      "region",
    ]);

    if (
      !cart ||
      !Array.isArray(cart.shipping_methods) ||
      cart.shipping_methods.length === 0
    ) {
      syncedCart = cart;
      return;
    }

    const extraTotal = calculateShippingExtra(cart);
    const repo = tm.getRepository<ShippingMethodEntity>("ShippingMethod");

    for (const method of cart.shipping_methods) {
      if (!method.data) method.data = {};

      const currentExtra = (method.data.shipping_extra_total as number) ?? 0;
      if (currentExtra === extraTotal) continue;

      const basePrice = method.price - currentExtra;
      method.price = basePrice + extraTotal;
      method.data.shipping_extra_total = extraTotal;

      await repo.save(method);
      log(
        `Synced shipping extra for method ${method.id}: ` +
          `extra ${currentExtra} → ${extraTotal} cents, price: ${basePrice + currentExtra} → ${method.price} cents`,
      );
    }

    syncedCart = cart;
  });

  return syncedCart;
}

export function applyShippingTotalsToCart(cart: CartEntity): void {
  const taxRate = cart.region?.tax_rate ?? cart.tax_rate ?? 0;
  const previousShippingTaxTotal = cart.shipping_tax_total || 0;
  const giftCardTaxTotal = cart.gift_card_tax_total || 0;
  const itemTaxTotal =
    cart.item_tax_total ??
    Math.max(
      0,
      (cart.tax_total || 0) - previousShippingTaxTotal + giftCardTaxTotal,
    );

  let correctedShippingSubtotal = 0;
  let correctedShippingTaxTotal = 0;

  for (const method of cart.shipping_methods || []) {
    const methodPrice = method.price || 0;
    const includesTax = method.includes_tax === true;

    let subtotal = methodPrice;
    let taxTotal = 0;
    let total = methodPrice;

    if (includesTax && taxRate > 0) {
      subtotal = Math.round(methodPrice / (1 + taxRate / 100));
      taxTotal = methodPrice - subtotal;
      total = methodPrice;
    } else {
      taxTotal = method.tax_total || 0;
      total = subtotal + taxTotal;
    }

    method.subtotal = subtotal;
    method.tax_total = taxTotal;
    method.total = total;

    correctedShippingSubtotal += subtotal;
    correctedShippingTaxTotal += taxTotal;
  }

  cart.shipping_total = correctedShippingSubtotal;
  cart.shipping_tax_total = correctedShippingTaxTotal;
  cart.item_tax_total = itemTaxTotal;
  cart.tax_total = itemTaxTotal + correctedShippingTaxTotal - giftCardTaxTotal;
  cart.total =
    (cart.subtotal || 0) +
    correctedShippingSubtotal +
    (cart.tax_total || 0) -
    (cart.discount_total || 0) -
    (cart.gift_card_total || 0);

  if (Array.isArray(cart.payment_sessions)) {
    for (const session of cart.payment_sessions) {
      session.amount = cart.total;
    }
  }
}

export function syncPaymentSessionAmountsWithCartTotal(cart: CartEntity): void {
  if (!Array.isArray(cart.payment_sessions)) {
    return;
  }

  for (const session of cart.payment_sessions) {
    session.amount = cart.total || 0;
  }
}

export function mergeSyncedShippingMethodsIntoCart(
  cart: CartEntity,
  syncedCart: CartEntity | null,
): void {
  if (!syncedCart || !Array.isArray(syncedCart.shipping_methods)) {
    return;
  }

  if (
    !Array.isArray(cart.shipping_methods) ||
    cart.shipping_methods.length === 0
  ) {
    cart.shipping_methods = syncedCart.shipping_methods;
    return;
  }

  const syncedMethodsById = new Map(
    syncedCart.shipping_methods.map((method) => [method.id, method]),
  );

  cart.shipping_methods = cart.shipping_methods.map((method) => {
    const syncedMethod = syncedMethodsById.get(method.id);

    if (!syncedMethod) {
      return method;
    }

    return {
      ...method,
      price: syncedMethod.price,
      data: {
        ...method.data,
        ...syncedMethod.data,
      },
    };
  });
}

export async function invalidateCartCache(
  req: MedusaRequest,
  cartId: string,
): Promise<void> {
  try {
    const cacheService = req.scope.resolve("cacheService") as {
      invalidate?: (key: string) => Promise<void>;
    };

    if (cacheService?.invalidate) {
      await cacheService.invalidate(`cart_${cartId}`);
      log(`Invalidated cart cache for ${cartId}`);
    }
  } catch (error) {
    logError(`Error invalidating cart cache for ${cartId}`, error);
  }
}

export async function hydrateCartWithShippingExtraResponse(
  req: MedusaRequest,
  manager: Manager,
  cartId: string,
  body: unknown,
  syncPaymentSessions = false,
): Promise<unknown> {
  const { cart, isDraftOrder } = extractCartFromBody(body);
  if (!cart || isDraftOrder) {
    return body;
  }

  const responseCartId = cart.id || cartId;
  if (!responseCartId) {
    return body;
  }

  const responseCart = cart;
  const syncedCart = await syncShippingExtraAfterMutation(
    manager,
    responseCartId,
  );
  await invalidateCartCache(req, responseCartId);

  mergeSyncedShippingMethodsIntoCart(responseCart, syncedCart);

  const spanishTaxService = resolveSpanishTaxService(req);
  const taxContext = spanishTaxService
    ? getTaxContext(responseCart, spanishTaxService)
    : null;

  if (taxContext?.isTaxExempt) {
    applyTaxExemptTransformations(responseCart, taxContext);
  } else {
    applyShippingTotalsToCart(responseCart);
  }

  syncPaymentSessionAmountsWithCartTotal(responseCart);

  if (
    syncPaymentSessions &&
    Array.isArray(responseCart.payment_sessions) &&
    responseCart.payment_sessions.length > 0
  ) {
    try {
      const cartService = req.scope.resolve("cartService") as {
        setPaymentSessions: (cartId: string) => Promise<unknown>;
      };

      await cartService.setPaymentSessions(responseCartId);
      await invalidateCartCache(req, responseCartId);
      syncPaymentSessionAmountsWithCartTotal(responseCart);
    } catch (error) {
      logError(
        `Error syncing payment sessions for cart ${responseCartId}`,
        error,
      );
    }
  }

  const bodyRecord = body as Record<string, unknown>;
  if (bodyRecord.cart) {
    bodyRecord.cart = responseCart;
    return bodyRecord;
  }

  if (
    bodyRecord.draft_order &&
    typeof bodyRecord.draft_order === "object" &&
    (bodyRecord.draft_order as Record<string, unknown>).cart
  ) {
    (bodyRecord.draft_order as Record<string, unknown>).cart = responseCart;
    return bodyRecord;
  }

  return body;
}

async function syncCartResponseAfterMutation(
  req: MedusaRequest,
  manager: Manager,
  cartId: string,
  body: unknown,
): Promise<unknown> {
  return hydrateCartWithShippingExtraResponse(req, manager, cartId, body, true);
}
