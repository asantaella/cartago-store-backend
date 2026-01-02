import { NextFunction, Response } from "express";
import { MedusaRequest } from "@medusajs/medusa";
import SpanishTaxService from "../../services/spanish-tax";
import {
  calculatePriceWithoutTax,
  calculateTaxAmount,
  adjustDiscountForTaxExempt,
} from "./cart-pricing-helpers";

// Type definitions
type LineItemEntity = {
  id: string;
  unit_price: number;
  discount_total?: number;
  quantity?: number;
  metadata?: Record<string, unknown> & { adjusted_unit_price?: number };
  subtotal?: number;
};

type ShippingMethodEntity = {
  id: string;
  price: number;
  data?: Record<string, unknown> & { adjusted_price?: number };
};

type CartEntity = {
  id: string;
  items?: LineItemEntity[];
  shipping_methods?: ShippingMethodEntity[];
  shipping_address?: { postal_code?: string };
  metadata?: Record<string, unknown> & {
    territory_type?: string;
    prices_adjusted?: boolean;
  };
};

type Repository<T> = {
  findOne: (opts: {
    where: { id: string };
    relations?: string[];
  }) => Promise<T | undefined>;
  save: (entity: Partial<T>) => Promise<T>;
};

type TransactionManager = {
  getRepository: <T>(name: string) => Repository<T>;
};

type Manager = {
  transaction: <T>(
    fn: (transactionalManager: TransactionManager) => Promise<T>
  ) => Promise<T>;
};

/**
 * Middleware que persiste los precios ajustados en metadata para zonas tax-exempt
 * en las peticiones POST/PATCH del carrito.
 * IMPORTANTE: NO modifica unit_price original, solo guarda el precio ajustado en metadata
 */
export async function adjustCartPricingOnPost(
  req: MedusaRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const cartId = req.params?.id as string | undefined;
    if (!cartId) {
      return next();
    }

    const spanishTaxService = req.scope.resolve(
      "spanishTaxService"
    ) as SpanishTaxService;
    const manager = req.scope.resolve("manager") as unknown as Manager;

    // Verificar si es una región tax-exempt ANTES de iniciar la transacción
    const tempCartRepo =
      manager.transaction === undefined
        ? null
        : await getCartForValidation(manager, cartId);

    if (!tempCartRepo) {
      return next();
    }

    const postalCode = tempCartRepo.shipping_address?.postal_code;
    if (!postalCode) {
      return next();
    }

    const isTaxExempt = spanishTaxService.isTaxExemptAddress(postalCode);
    if (!isTaxExempt) {
      return next();
    }

    const territoryType = spanishTaxService.getTerritoryType(postalCode);

    // Solo ejecutar transacción si es zona tax-exempt
    await manager.transaction(
      async (transactionalManager: TransactionManager) => {
        const cartRepo = transactionalManager.getRepository<CartEntity>("Cart");
        const lineItemRepo =
          transactionalManager.getRepository<LineItemEntity>("LineItem");
        const shippingMethodRepo =
          transactionalManager.getRepository<ShippingMethodEntity>(
            "ShippingMethod"
          );

        const cart = await cartRepo.findOne({
          where: { id: cartId },
          relations: ["items", "shipping_methods", "shipping_address"],
        });

        if (!cart) {
          return;
        }

        // Persistir adjusted_unit_price en line items
        if (Array.isArray(cart.items) && cart.items.length > 0) {
          for (const item of cart.items) {
            const priceWithTax = item.unit_price;
            if (typeof priceWithTax !== "number" || !isFinite(priceWithTax))
              continue;

            const basePrice = Math.round(
              calculatePriceWithoutTax(priceWithTax)
            );
            const dbItem = await lineItemRepo.findOne({
              where: { id: item.id },
            });

            if (dbItem) {
              dbItem.metadata = {
                ...dbItem.metadata,
                adjusted_unit_price: basePrice,
              };
              await lineItemRepo.save(dbItem);
            }
          }
        }

        // Persistir adjusted_price en shipping methods
        if (
          Array.isArray(cart.shipping_methods) &&
          cart.shipping_methods.length > 0
        ) {
          for (const method of cart.shipping_methods) {
            const priceWithTax = method.price;
            if (typeof priceWithTax !== "number" || !isFinite(priceWithTax))
              continue;

            const baseShippingPrice = Math.round(
              calculatePriceWithoutTax(priceWithTax)
            );
            const dbMethod = await shippingMethodRepo.findOne({
              where: { id: method.id },
            });

            if (dbMethod) {
              dbMethod.data = {
                ...dbMethod.data,
                adjusted_price: baseShippingPrice,
              };
              await shippingMethodRepo.save(dbMethod);
            }
          }
        }

        // Actualizar metadata del carrito
        cart.metadata = {
          ...cart.metadata,
          territory_type: territoryType,
          prices_adjusted: true,
        };

        await cartRepo.save(cart);
      }
    );

    return next();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      "[cart-pricing-middleware] Error persisting prices on POST/PATCH:",
      msg
    );
    return next();
  }
}

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

    await manager.transaction(
      async (transactionalManager: TransactionManager) => {
        const cartRepo = transactionalManager.getRepository<CartEntity>("Cart");
        cart =
          (await cartRepo.findOne({
            where: { id: cartId },
            relations: ["shipping_address"],
          })) ?? null;
      }
    );

    return cart;
  } catch {
    return null;
  }
}
