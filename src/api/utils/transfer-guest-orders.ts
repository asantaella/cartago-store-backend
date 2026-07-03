import { EntityManager } from "typeorm";
import { CustomerService, OrderService } from "@medusajs/medusa/dist/services";

export interface TransferOptions {
  scope: {
    resolve: <T>(name: string) => T;
  };
  email: string;
  newCustomerId: string;
  /** Si se debe eliminar el guest customer después de transferir las órdenes. Default: true */
  deleteGuest?: boolean;
}

export interface TransferResult {
  ordersTransferred: number;
  guestCustomerDeleted: boolean;
  /** ID del guest customer, si existía */
  guestCustomerId?: string;
}

/**
 * Transfiere todas las órdenes de un guest customer (has_account: false)
 * a un customer registrado, y opcionalmente elimina el guest.
 *
 * La operación completa se ejecuta dentro de una transacción TypeORM:
 * si falla alguna reasignación de orden, se hace rollback de todo.
 */
export const transferOrdersFromGuestToCustomer = async ({
  scope,
  email,
  newCustomerId,
  deleteGuest = true,
}: TransferOptions): Promise<TransferResult> => {
  const manager: EntityManager = scope.resolve("manager");

  return await manager.transaction(async (transactionManager) => {
    const customerServiceBase: CustomerService = scope.resolve("customerService");
    const customerService = customerServiceBase.withTransaction(transactionManager);

    const orderServiceBase: OrderService = scope.resolve("orderService");
    const orderService = orderServiceBase.withTransaction(transactionManager);

    // Buscar guest customers con ese email (has_account: false)
    const guestCustomers = await customerService.list({
      email,
      has_account: false,
    });

    if (guestCustomers.length === 0) {
      return { ordersTransferred: 0, guestCustomerDeleted: false };
    }

    const guestCustomer = guestCustomers[0];

    // Buscar órdenes asociadas al guest customer
    const orders = await orderService.list({ customer_id: guestCustomer.id });

    let transferred = 0;
    for (const order of orders) {
      await orderService.update(order.id, { customer_id: newCustomerId });
      transferred++;
    }

    // Eliminar el guest customer si está configurado
    let guestDeleted = false;
    if (deleteGuest) {
      await customerService.delete(guestCustomer.id);
      guestDeleted = true;
    }

    return {
      ordersTransferred: transferred,
      guestCustomerDeleted: guestDeleted,
      guestCustomerId: guestCustomer.id,
    };
  });
};
