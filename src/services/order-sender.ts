import {
  AbstractNotificationService,
  Order,
  OrderService,
} from "@medusajs/medusa";

import SendGridService from "medusa-plugin-sendgrid/services/sendgrid";
import { EntityManager } from "typeorm";

class OrderSenderService extends AbstractNotificationService {
  protected manager_: EntityManager;
  protected transactionManager_: EntityManager;
  protected orderService: OrderService;
  private sendGridService: any;
  static identifier = "order-sender";
  static is_installed = true;

  constructor(container, options) {
    super(container);
    console.log("[CREATING] ORDER SENDER SERVICE");
    this.sendGridService = new SendGridService(container, {
      ...options,
      api_key: process.env.SENDGRID_API_KEY,
      from: process.env.SENDGRID_FROM,
      order_placed_template: process.env.SENDGRID_ORDER_PLACED_ID,
    });

    console.log("Sendgrid service Id", this.sendGridService.identifier);
    // you can access options here in case you're
    // using a plugin

    this.orderService = container.orderService;
    //this.sendGridService = container.resolve(SendGridService);
    console.log("[CREATED] ORDER SENDER SERVICE");
  }

  humanPrice_(amount: string, currency: string) {
    const humanPrice = this.sendGridService.humanPrice_(amount, currency);
    return `${humanPrice} ${currency}`;
  }

  createCustomSendingOptions(toEmail: string) {
    return [
      {
        to: toEmail,
        from: {
          name: process.env.SENDGRID_SENDER_NAME,
          email: process.env.SENDGRID_FROM,
        },
      },
    ];
  }

  createSendingOptions(notificationOrder: Order) {
    return {
      api_key: process.env.SENDGRID_API_KEY,
      templateId: process.env.SENDGRID_ORDER_PLACED_ID,
      from: process.env.SENDGRID_FROM,
      to: notificationOrder.customer.email,
      personalizations: this.createCustomSendingOptions(
        notificationOrder.customer.email
      ),
      dynamic_template_data: {
        display_id: notificationOrder.display_id,
        date: notificationOrder.created_at,
        items: notificationOrder.items,
        status: notificationOrder.status,
        shipping_address: notificationOrder.shipping_address,
        customer: notificationOrder.customer,
        shipping_total: notificationOrder.shipping_total,
        total: notificationOrder.total,
        subtotal: notificationOrder.subtotal,
        tax_total: notificationOrder.tax_total,
        tax_rate: notificationOrder.tax_rate,
        Sender_Name: "Cartago4x4",
        Sender_Address: "Avda de las Lomas S/N",
        Sender_City: "Cartagena",
        Sender_State: "Murcia",
        Sender_Zip: "1234",
        dateFormat: "DD/MM/YYYY HH:mm:ss",
      },
    };
  }

  async sendNotification(
    event: string,
    data: unknown,
    attachmentGenerator: unknown
  ): Promise<{
    to: string;
    status: string;
    data: Record<string, unknown>;
  }> {
    const order = await this.orderService.retrieve(
      (data as Order).id as string
    );
    // console.log("Order data => ", order);
    const currencyCode = order.currency_code.toUpperCase();
    const notificationData = await this.sendGridService.fetchData(
      "order.placed",
      order
    );

    // console.log("Notifications data => ", notificationData);
    const orderItems = notificationData.items.map((item) => ({
      ...item,
      totals: {
        ...item.totals,
        total: this.humanPrice_(item.totals.total, currencyCode),
      },
    }));
    // console.log(
    //   "ORDER ITEMS TOTALS => ",
    //   orderItems.map((items) => items.totals)
    // );
    const notificationOrder = { ...notificationData, items: orderItems };

    const sendOptions = this.createSendingOptions(notificationOrder);

    console.log("SEND EMAIL => ", sendOptions);
    const status = await this.sendGridService
      .sendEmail(sendOptions)
      .then(() => "sent")
      .catch(() => "failed");

    await this.sendGridService
      .sendEmail({
        ...sendOptions,
        to: process.env.SENDGRID_TO_ADMIN,
        personalizations: this.createCustomSendingOptions(
          process.env.SENDGRID_TO_ADMIN
        ),
      })
      .then(() => "sent")
      .catch(() => "failed");

    return {
      to: order.email,
      status,
      data: sendOptions,
    };
  }

  async resendNotification(
    notification: any,
    config: any,
    attachmentGenerator: unknown
  ): Promise<{
    to: string;
    status: string;
    data: Record<string, unknown>;
  }> {
    console.log("[NOTIFICATION] [RESEND]: ", notification);
    // check if the receiver should be changed
    const to: string = config.to ? config.to : notification.to;

    // TODO resend the notification using the same data
    // that is saved under notification.data

    return {
      to,
      status: "done",
      data: notification.data, // make changes to the data
    };
  }
}

export default OrderSenderService;
