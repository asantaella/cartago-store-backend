import { Cart, CartService as MedusaCartService } from "@medusajs/medusa";
import { EntityManager } from "typeorm";
import SpanishTaxService from "./spanish-tax";
import { LineItemUpdate } from "@medusajs/medusa/dist/types/cart";

export default class CartService extends MedusaCartService {
  private canariasService: SpanishTaxService;
  private container: any;

  constructor(container: any) {
    // @ts-ignore
    super(container);
    this.container = container;
    this.canariasService = new SpanishTaxService(container);

    const stack = new Error().stack;
  }

  async testMethod(): Promise<string> {
    console.log(
      "[CartService] *** Test method called - custom service is working ***"
    );
    return "Custom CartService is working!";
  }

  withTransaction(transactionManager: EntityManager): this {
    if (!transactionManager) {
      return this;
    }

    const cloned = new CartService(this.container);

    (cloned as any).transactionManager_ = transactionManager;
    (cloned as any).manager_ = transactionManager;

    // Propagar el container correctamente
    cloned.container = this.container;

    Object.keys(this).forEach((key) => {
      if (
        key.endsWith("Service") ||
        key.endsWith("Repository") ||
        key.endsWith("_")
      ) {
        (cloned as any)[key] = (this as any)[key];
      }
    });

    return cloned as unknown as this;
  }

  // MÉTODO PRINCIPAL: retrieve que aplica pricing ANTES de devolver el cart
  async retrieve(cartId: string, options: any = {}): Promise<any> {
    // Asegurar que siempre se incluyan las relaciones necesarias para draft orders
    const enrichedOptions = {
      ...options,
      relations: [
        ...(options.relations || []),
        // Relaciones adicionales necesarias para draft orders y payment
        "payment_sessions",
        "payment",
      ].filter((v, i, a) => a.indexOf(v) === i), // Eliminar duplicados
    };

    // PRIMERA: Obtener el cart sin ajustes
    let cart = await super.retrieve(cartId, enrichedOptions);

    const postal = cart?.shipping_address?.postal_code as string | undefined;

    // SEGUNDA: Si hay código postal, aplicar pricing inmediatamente
    if (postal) {
      const isTaxExempt = this.canariasService.isTaxExemptAddress(postal);
      const territoryType = this.canariasService.getTerritoryType(postal);

      // Aplicar pricing inmediatamente usando lógica simplificada
      try {
        // Usar directamente la lógica de pricing sin dependencia circular
        await this.applyImmediatePricing(cartId, isTaxExempt, territoryType);

        // TERCERA: Re-obtener el cart con precios actualizados Y todas las relaciones
        cart = await super.retrieve(cartId, enrichedOptions);
      } catch (error) {
        console.warn(
          `[CartService] Error applying immediate postal pricing:`,
          error.message
        );
      }

      // Log final prices for debugging
      if (Array.isArray(cart.items) && cart.items.length > 0) {
        for (const item of cart.items) {
          const basePrice = item.variant?.prices?.find(
            (p) => p.currency_code === "eur"
          )?.amount;
        }
      }

      if (
        Array.isArray(cart.shipping_methods) &&
        cart.shipping_methods.length > 0
      ) {
        for (const sm of cart.shipping_methods) {
          const basePrice = (sm as any)?.shipping_option?.amount;
        }
      }
    }
    return cart;
  }

  // Override updateLineItem para evitar doble conversión
  public async updateLineItem(
    cartId: string,
    lineItemId: string,
    update: LineItemUpdate
  ): Promise<Cart> {
    // Solo aplicar conversión si es una actualización manual de precio
    // y no viene de nuestro sistema de persistencia
    try {
      let shouldConvert = false;

      if (typeof update.unit_price === "number") {
        const cart = await this.retrieve(cartId, {
          relations: ["shipping_address"],
        });
        const postal = cart.shipping_address?.postal_code;

        if (
          postal &&
          this.canariasService.isTaxExemptAddress(postal) &&
          !cart?.metadata?.canarias_prices_persisted
        ) {
          shouldConvert = true;
        }
      }

      if (shouldConvert && typeof update.unit_price === "number") {
        update.unit_price = this.canariasService.calculatePriceWithoutTax(
          update.unit_price
        );
      }
    } catch (e) {
      console.warn(
        "[CartService] updateLineItem: could not adjust prices:",
        e.message
      );
    }

    return super.updateLineItem(cartId, lineItemId, update);
  }

  /**
   * Aplica pricing inmediato basado en código postal sin dependencia circular
   */
  private async applyImmediatePricing(
    cartId: string,
    isTaxExempt: boolean,
    territoryType: string
  ): Promise<void> {
    return this.atomicPhase_(async (manager) => {
      // Obtener el cart con relaciones necesarias
      const cartRepo = manager.getRepository("Cart");
      const cart = await cartRepo.findOne({
        where: { id: cartId },
        relations: [
          "items",
          "items.variant",
          "items.variant.prices",
          "shipping_methods",
          "shipping_methods.shipping_option",
        ],
      });

      if (!cart) {
        return;
      }

      // Detectar cambio de zona y resetear shipping methods si es necesario
      const previousZone = cart.metadata?.previous_tax_zone as string;
      console.log(
        `ℹ️ℹ️ [CartService] Detected zone change for cart: ${previousZone} -> ${territoryType}`
      );
      //  const currentZone = isTaxExempt ? "tax_exempt" : "standard";
      const zoneChanged = previousZone && previousZone !== territoryType;

      let removedShippingCount = 0;
      if (
        zoneChanged &&
        cart.shipping_methods &&
        cart.shipping_methods.length > 0
      ) {
        const shippingMethodRepo = manager.getRepository("ShippingMethod");

        for (const method of cart.shipping_methods) {
          try {
            await shippingMethodRepo.delete(method.id);
            removedShippingCount++;
            console.log(
              `[CartService] Removed shipping method ${method.id} due to zone change from ${previousZone} to ${territoryType}`
            );
          } catch (error) {
            console.error(
              `[CartService] Error removing shipping method ${method.id}:`,
              error.message
            );
          }
        }

        // Actualizar metadata del carrito
        await cartRepo.update(cartId, {
          metadata: {
            ...cart.metadata,
            previous_tax_zone: territoryType,
          },
        });
      } else if (!previousZone) {
        // Primera vez que se detecta zona, solo actualizar metadata
        await cartRepo.update(cartId, {
          metadata: {
            ...cart.metadata,
            previous_tax_zone: territoryType,
          },
        });
      }

      let itemsUpdated = 0;
      let shippingUpdated = 0;

      // Procesar items
      if (Array.isArray(cart.items) && cart.items.length > 0) {
        const lineItemRepo = manager.getRepository("LineItem");

        for (const item of cart.items) {
          const basePrice = item.variant?.prices?.find(
            (p) => p.currency_code === "eur"
          )?.amount;

          if (typeof basePrice === "number" && isFinite(basePrice)) {
            let targetPrice: number;

            if (isTaxExempt) {
              // Para territorios exentos: precio sin IVA
              targetPrice = Math.round(basePrice / 1.21);
            } else {
              // Para territorios estándar: precio original
              targetPrice = basePrice;
            }

            if (item.unit_price !== targetPrice) {
              await lineItemRepo.update(item.id, { unit_price: targetPrice });
              itemsUpdated++;
            }
          }
        }
      }

      // Procesar métodos de envío solo si no fueron reseteados debido a cambio de zona
      if (
        removedShippingCount === 0 &&
        Array.isArray(cart.shipping_methods) &&
        cart.shipping_methods.length > 0
      ) {
        const shippingMethodRepo = manager.getRepository("ShippingMethod");

        for (const method of cart.shipping_methods) {
          const basePrice = (method as any)?.shipping_option?.amount;

          if (typeof basePrice === "number" && isFinite(basePrice)) {
            let targetPrice: number;

            if (isTaxExempt) {
              // Para territorios exentos: precio sin IVA
              targetPrice = Math.round(basePrice / 1.21);
            } else {
              // Para territorios estándar: precio original
              targetPrice = basePrice;
            }

            if (method.price !== targetPrice) {
              await shippingMethodRepo.update(method.id, {
                price: targetPrice,
              });
              shippingUpdated++;
            }
          }
        }
      }
    });
  }
}
