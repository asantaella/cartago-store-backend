import { BaseService } from "medusa-interfaces";
import { Order, OrderService } from "@medusajs/medusa";

class InvoiceNumberGeneratorService extends BaseService {
  protected orderService_: OrderService;

  constructor(container) {
    super(container);
    this.orderService_ = container.orderService;
  }

  /**
   * Genera el número de factura basado en el display_id del pedido
   * @param order - El pedido para el cual generar el número de factura
   * @returns El número de factura formateado o undefined si no se puede generar
   */
  getInvoiceNumber(order: Order): string | undefined {
    if (!order || !order.display_id || !process.env.INVOICE_START_REF) {
      return undefined;
    }

    const invoiceStartRef = parseInt(process.env.INVOICE_START_REF || "0");
    const year = new Date().getFullYear();
    const invoiceNumber = invoiceStartRef + order.display_id;
    const invoiceRef = invoiceNumber.toString().padStart(5, "0");
 
    return `${year}-${invoiceRef}`;
  }

  /**
   * Establece el número de factura en los metadatos del pedido
   * @param orderId - El ID del pedido
   * @returns El pedido actualizado
   */
  async setOrderInvoiceNumber(orderId: string): Promise<Order> {
    const order = await this.orderService_.retrieve(orderId, {
      relations: ["items", "customer", "shipping_address", "billing_address"],
    });

    const invoiceNumber = this.getInvoiceNumber(order);

    if (!invoiceNumber) {
      throw new Error(
        `No se pudo generar el número de factura para el pedido ${order.display_id}`
      );
    }

    const updatedOrder = await this.orderService_.update(orderId, {
      metadata: {
        ...order.metadata,
        invoice_number: invoiceNumber,
      },
    });

    return updatedOrder;
  }
}

export default InvoiceNumberGeneratorService;
