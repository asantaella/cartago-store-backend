import { ShippingOptionService as MedusaShippingOptionService } from "@medusajs/medusa";
import { ShippingMethod } from "@medusajs/medusa/dist/models";

/**
 * ShippingOptionService override que evita borrar los shipping methods
 * cuando el cart pertenece a un draft order.
 *
 * Medusa borra los shipping methods cada vez que se modifica un line item
 * (addOrUpdateLineItems, updateLineItem, removeLineItem). En el storefront
 * esto tiene sentido porque el cliente debe re-seleccionar el método, pero
 * en el admin de draft orders hace que el shipping total se pierda al
 * editar/agregar/eliminar line items.
 */
class ShippingOptionService extends MedusaShippingOptionService {
  protected draftOrderRepository_: any;

  constructor(container: any) {
    super(container);
    this.draftOrderRepository_ = container.draftOrderRepository;
  }

  async deleteShippingMethods(
    shippingMethods: ShippingMethod | ShippingMethod[]
  ): Promise<ShippingMethod[]> {
    const methods = Array.isArray(shippingMethods)
      ? shippingMethods
      : [shippingMethods];

    if (methods.length === 0) {
      return await super.deleteShippingMethods(shippingMethods);
    }

    const cartId = methods[0].cart_id;
    if (!cartId) {
      return await super.deleteShippingMethods(shippingMethods);
    }

    try {
      const draftOrderRepo = this.activeManager_.withRepository(
        this.draftOrderRepository_
      );
      const draftOrders = await draftOrderRepo.find({
        where: { cart_id: cartId },
        take: 1,
      });

      if (draftOrders.length > 0) {
        console.log(
          `[ShippingOptionService] Skipping deletion of ${methods.length} shipping method(s) for draft order cart ${cartId}`
        );
        return methods;
      }
    } catch (error) {
      console.error(
        `[ShippingOptionService] Error checking draft order for cart ${cartId}:`,
        error
      );
    }

    return await super.deleteShippingMethods(shippingMethods);
  }
}

export default ShippingOptionService;
