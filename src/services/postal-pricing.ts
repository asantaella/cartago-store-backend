import { TransactionBaseService } from "@medusajs/medusa";
import { Lifetime } from "awilix";
import { EntityManager } from "typeorm";
import { LineItem, ShippingMethod, Cart } from "@medusajs/medusa";
import { Logger } from "@medusajs/medusa/dist/types/global";
import SpanishTaxService from "./spanish-tax";

interface PricingAdjustment {
  itemId: string;
  originalPrice: number;
  adjustedPrice: number;
  territoryType: string;
}

interface ShippingAdjustment {
  methodId: string;
  originalPrice: number;
  adjustedPrice: number;
  territoryType: string;
}

interface PricingTransaction {
  cartId: string;
  postalCode: string;
  territoryType: string;
  isTaxExempt: boolean;
  itemAdjustments: PricingAdjustment[];
  shippingAdjustments: ShippingAdjustment[];
  timestamp: Date;
  zoneChanged?: boolean;
  removedShippingMethods?: number;
}

/**
 * Servicio especializado para gestionar transacciones de precios basadas en códigos postales
 * Maneja la lógica de diferenciación entre territorios estándar y territorios con exención de IVA
 */
class PostalPricingService extends TransactionBaseService {
  static LIFE_TIME = Lifetime.SCOPED;

  protected manager_: EntityManager;
  protected transactionManager_: EntityManager | undefined;
  protected logger_: Logger;
  protected canariasService: SpanishTaxService;

  constructor(container: any) {
    super(container);
    this.manager_ = container.manager;
    this.logger_ = container.logger;
    this.canariasService = new SpanishTaxService(container);
  }

  withTransaction(transactionManager: EntityManager): this {
    if (!transactionManager) {
      return this;
    }

    const cloned = new PostalPricingService(
      (this as any).dependencies || (this as any).container || {}
    );

    cloned.transactionManager_ = transactionManager;
    cloned.manager_ = transactionManager;

    return cloned as unknown as this;
  }

  /**
   * Aplica transacciones de precios basadas en el código postal del carrito
   */
  async applyPostalPricing(cartId: string): Promise<PricingTransaction | null> {
    return this.atomicPhase_(async (manager) => {
      try {
        // Obtener el carrito con todas las relaciones necesarias
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

        if (!cart) {
          console.warn(`[PostalPricingService] Cart ${cartId} not found`);
          return null;
        }

        const postalCode = cart.shipping_address?.postal_code;
        if (!postalCode) {
          console.log(
            `[PostalPricingService] No postal code found for cart ${cartId}`
          );
          return null;
        }

        const territoryType = this.canariasService.getTerritoryType(postalCode);
        const isTaxExempt = this.canariasService.isTaxExemptAddress(postalCode);

        // Detectar cambio de zona y resetear shipping methods si es necesario
        const previousZone = cart.metadata?.previous_tax_zone as string;
        const currentZone = territoryType
        const zoneChanged = previousZone && previousZone !== currentZone;

        const transaction: PricingTransaction = {
          cartId,
          postalCode,
          territoryType,
          isTaxExempt,
          itemAdjustments: [],
          shippingAdjustments: [],
          timestamp: new Date(),
          zoneChanged: zoneChanged || false,
          removedShippingMethods: 0,
        };

        // Si cambió la zona, resetear shipping methods
        let removedCount = 0;
        if (
          zoneChanged &&
          cart.shipping_methods &&
          cart.shipping_methods.length > 0
        ) {
          removedCount = await this.resetShippingMethods(
            manager,
            cart.shipping_methods
          );
          transaction.removedShippingMethods = removedCount;
          console.log(
            `[PostalPricingService] Zone changed from ${previousZone} to ${currentZone}. Removed ${removedCount} shipping methods for cart ${cartId}`
          );
        }

        await cartRepo.update(cartId, {
          metadata: {
            ...cart.metadata,
            previous_tax_zone: currentZone,
          },
        });

        // Procesar items del carrito
        if (isTaxExempt) {
          await this.processTaxExemptItems(manager, cart.items, transaction);
          // Solo procesar shipping methods si no fueron reseteados
          if (removedCount === 0) {
            await this.processTaxExemptShipping(
              manager,
              cart.shipping_methods,
              transaction
            );
          }
        } else {
          await this.processStandardItems(manager, cart.items, transaction);
          // Solo procesar shipping methods si no fueron reseteados
          if (removedCount === 0) {
            await this.processStandardShipping(
              manager,
              cart.shipping_methods,
              transaction
            );
          }
        }

        return transaction;
      } catch (error) {
        console.error(
          `[PostalPricingService] Error processing cart ${cartId}:`,
          error.message
        );
        throw error;
      }
    });
  }

  /**
   * Procesa items para territorios con exención de IVA
   */
  private async processTaxExemptItems(
    manager: EntityManager,
    items: LineItem[],
    transaction: PricingTransaction
  ): Promise<void> {
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }

    const lineItemRepo = manager.getRepository(LineItem);

    for (const item of items) {
      try {
        // Precio base (con IVA) desde variant.prices
        const basePrice = item.variant?.prices?.find(
          (p) => p.currency_code === "eur"
        )?.amount;

        if (typeof basePrice !== "number" || !isFinite(basePrice)) {
          console.warn(
            `[PostalPricingService] Invalid base price for item ${item.id}: ${basePrice}`
          );
          continue;
        }

        // Calcular precio sin IVA (8.26€ para un producto de 10€)
        const priceWithoutTax = Math.round(basePrice / 1.21);

        if (item.unit_price !== priceWithoutTax) {
          await lineItemRepo.update(item.id, { unit_price: priceWithoutTax });

          transaction.itemAdjustments.push({
            itemId: item.id,
            originalPrice: item.unit_price,
            adjustedPrice: priceWithoutTax,
            territoryType: transaction.territoryType,
          });
        }
      } catch (error) {
        console.error(
          `[PostalPricingService] Error processing tax-exempt item ${item.id}:`,
          error.message
        );
      }
    }
  }

  /**
   * Procesa items para territorios estándar (con IVA 21%)
   */
  private async processStandardItems(
    manager: EntityManager,
    items: LineItem[],
    transaction: PricingTransaction
  ): Promise<void> {
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }

    const lineItemRepo = manager.getRepository(LineItem);

    for (const item of items) {
      try {
        // Precio original (con IVA) desde variant.prices
        const originalPrice = item.variant?.prices?.find(
          (p) => p.currency_code === "eur"
        )?.amount;

        if (typeof originalPrice !== "number" || !isFinite(originalPrice)) {
          console.warn(
            `[PostalPricingService] Invalid original price for item ${item.id}: ${originalPrice}`
          );
          continue;
        }

        if (item.unit_price !== originalPrice) {
          console.log(
            `[PostalPricingService] Restoring item ${item.id}: ${item.unit_price} -> ${originalPrice} (standard tax: ${transaction.territoryType})`
          );

          await lineItemRepo.update(item.id, { unit_price: originalPrice });

          transaction.itemAdjustments.push({
            itemId: item.id,
            originalPrice: item.unit_price,
            adjustedPrice: originalPrice,
            territoryType: transaction.territoryType,
          });
        }
      } catch (error) {
        console.error(
          `[PostalPricingService] Error processing standard item ${item.id}:`,
          error.message
        );
      }
    }
  }

  /**
   * Procesa métodos de envío para territorios con exención de IVA
   */
  private async processTaxExemptShipping(
    manager: EntityManager,
    shippingMethods: ShippingMethod[],
    transaction: PricingTransaction
  ): Promise<void> {
    if (!Array.isArray(shippingMethods) || shippingMethods.length === 0) {
      return;
    }

    const shippingMethodRepo = manager.getRepository(ShippingMethod);

    for (const method of shippingMethods) {
      try {
        // Precio base (con IVA) desde shipping_option.amount
        const basePrice = (method as any)?.shipping_option?.amount;

        if (typeof basePrice !== "number" || !isFinite(basePrice)) {
          console.warn(
            `[PostalPricingService] Invalid base price for shipping method ${method.id}: ${basePrice}`
          );
          continue;
        }

        // Calcular precio sin IVA
        const priceWithoutTax = Math.round(basePrice / 1.21);

        if (method.price !== priceWithoutTax) {
          console.log(
            `[PostalPricingService] Adjusting shipping method ${method.id}: ${method.price} -> ${priceWithoutTax} (tax-exempt: ${transaction.territoryType})`
          );

          await shippingMethodRepo.update(method.id, {
            price: priceWithoutTax,
          });

          transaction.shippingAdjustments.push({
            methodId: method.id,
            originalPrice: method.price,
            adjustedPrice: priceWithoutTax,
            territoryType: transaction.territoryType,
          });
        }
      } catch (error) {
        console.error(
          `[PostalPricingService] Error processing tax-exempt shipping method ${method.id}:`,
          error.message
        );
      }
    }
  }

  /**
   * Procesa métodos de envío para territorios estándar (con IVA 21%)
   */
  private async processStandardShipping(
    manager: EntityManager,
    shippingMethods: ShippingMethod[],
    transaction: PricingTransaction
  ): Promise<void> {
    if (!Array.isArray(shippingMethods) || shippingMethods.length === 0) {
      return;
    }

    const shippingMethodRepo = manager.getRepository(ShippingMethod);

    for (const method of shippingMethods) {
      try {
        // Precio original (con IVA) desde shipping_option.amount
        const originalPrice = (method as any)?.shipping_option?.amount;

        if (typeof originalPrice !== "number" || !isFinite(originalPrice)) {
          console.warn(
            `[PostalPricingService] Invalid original price for shipping method ${method.id}: ${originalPrice}`
          );
          continue;
        }

        if (method.price !== originalPrice) {
          console.log(
            `[PostalPricingService] Restoring shipping method ${method.id}: ${method.price} -> ${originalPrice} (standard tax: ${transaction.territoryType})`
          );

          await shippingMethodRepo.update(method.id, { price: originalPrice });

          transaction.shippingAdjustments.push({
            methodId: method.id,
            originalPrice: method.price,
            adjustedPrice: originalPrice,
            territoryType: transaction.territoryType,
          });
        }
      } catch (error) {
        console.error(
          `[PostalPricingService] Error processing standard shipping method ${method.id}:`,
          error.message
        );
      }
    }
  }

  /**
   * Resetea todos los shipping methods del carrito cuando cambia de zona
   * @param manager - Entity Manager para la transacción
   * @param shippingMethods - Métodos de envío a eliminar
   * @returns Número de métodos eliminados
   */
  private async resetShippingMethods(
    manager: EntityManager,
    shippingMethods: ShippingMethod[]
  ): Promise<number> {
    if (!Array.isArray(shippingMethods) || shippingMethods.length === 0) {
      return 0;
    }

    const shippingMethodRepo = manager.getRepository(ShippingMethod);
    let removedCount = 0;

    for (const method of shippingMethods) {
      try {
        await shippingMethodRepo.delete(method.id);
        removedCount++;
        console.log(
          `[PostalPricingService] Removed shipping method ${method.id} due to zone change`
        );
      } catch (error) {
        console.error(
          `[PostalPricingService] Error removing shipping method ${method.id}:`,
          error.message
        );
      }
    }

    return removedCount;
  }
}

export default PostalPricingService;
