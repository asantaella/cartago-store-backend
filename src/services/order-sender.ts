import {
  AbstractNotificationService,
  Order,
  OrderService,
  Region,
  RegionService,
} from "@medusajs/medusa";

import SendGridService from "medusa-plugin-sendgrid/services/sendgrid";
import { EntityManager } from "typeorm";

class OrderSenderService extends AbstractNotificationService {
  protected manager_: EntityManager;
  protected transactionManager_: EntityManager;
  protected orderService: OrderService;
  protected regionService: RegionService;
  private sendGridService: any;
  static identifier = "order-sender";
  static is_installed = true;

  constructor(container, options) {
    super(container);
    this.sendGridService = new SendGridService(container, {
      ...options,
      api_key: process.env.SENDGRID_API_KEY,
      from: process.env.SENDGRID_FROM,
      order_placed_template: process.env.SENDGRID_ORDER_PLACED_ID,
    });

    this.orderService = container.orderService;
    this.regionService = container.regionService;
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
    const order: Order = await this.orderService.retrieve(
      (data as Order).id as string
    );
    const region: Region = await this.regionService.retrieve(order.region_id);
    const currencyCode = order.currency_code.toUpperCase();
    const notificationData = await this.sendGridService.fetchData(
      "order.placed",
      order
    );
    const orderItems = notificationData.items.map((item) => ({
      ...item,
      ref: item.variant ? item.variant.barcode : undefined,
      totals: {
        ...item.totals,
        unit_price: this.humanPrice_(item.unit_price, currencyCode),
        total: this.humanPrice_(item.totals.subtotal, currencyCode),
      },
    }));

    const subtotal = notificationData.items.reduce(
      (total, item) => total + item.subtotal,
      0
    );
    const tax_total = subtotal - subtotal / (1 + region.tax_rate / 100);
    const subtotal_ex_taxes = subtotal - tax_total;
    const shipping_total =
      parseFloat(notificationData.shipping_total.split(" ")[0]) * 100;
    const total = subtotal + shipping_total;
    const customer = notificationData.customer;
    customer.first_name =
      customer.first_name || notificationData.shipping_address.first_name;
    customer.last_name =
      customer.last_name || notificationData.shipping_address.last_name;
    const notificationOrder = {
      ...notificationData,
      customer,
      items: orderItems,
      total: this.humanPrice_(total, currencyCode),
      subtotal: this.humanPrice_(
        subtotal_ex_taxes.toPrecision(2),
        currencyCode
      ),
      tax_total: this.humanPrice_(tax_total.toPrecision(2), currencyCode),
      tax_rate: region.tax_rate,
    };
    const sendOptions = this.createSendingOptions(notificationOrder);

    console.log("[Send email] => ", {
      ...sendOptions,
      dynamic_template_data: {
        ...sendOptions.dynamic_template_data,
        items: sendOptions.dynamic_template_data.items.map((item) =>
          JSON.stringify(item)
        ),
      },
    });

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
    console.log("[Resend notifications][Order placed]: ", notification);
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
