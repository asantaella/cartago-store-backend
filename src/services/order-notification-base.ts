import { Order, OrderService } from "@medusajs/medusa";

class OrderNotificationBase {
  protected orderService: OrderService;
  protected config: any;

  constructor(container) {
    this.orderService =
      container.orderService || container.resolve?.("orderService");

    if (!this.orderService) {
      throw new Error("orderService is required to build order notifications");
    }

    this.config = {
      order_placed_url: process.env.MAILERSEND_ORDER_PLACED_URL,
      support_url: process.env.MAILERSEND_SUPPORT_URL,
      account_name: process.env.MAILERSEND_SENDER_NAME,
      company_name: process.env.MAILERSEND_COMPANY_NAME,
      sender_name: process.env.MAILERSEND_SENDER_NAME,
      sender_email: process.env.MAILERSEND_SENDER_EMAIL,
      sender_address: process.env.MAILERSEND_SENDER_ADDRESS,
      admin_email: process.env.MAILERSEND_ADMIN_EMAIL,
    };
  }

  get senderEmail(): string {
    return this.config.sender_email || "equipo@cartago4x4.com";
  }

  get senderName(): string {
    return this.config.sender_name || "Cartago4x4";
  }

  async retrieveOrderWithRelations(
    orderId: string,
    relations: string[] = [],
  ): Promise<Order> {
    return await this.orderService.retrieveWithTotals(orderId, {
      relations: [
        "shipping_address",
        "billing_address",
        "items",
        "items.variant",
        "items.variant.product",
        "shipping_methods",
        "shipping_methods.shipping_option",
        "shipping_methods.tax_lines",
        "discounts",
        "region",
        "currency",
        ...relations,
      ],
    });
  }
}

export default OrderNotificationBase;
