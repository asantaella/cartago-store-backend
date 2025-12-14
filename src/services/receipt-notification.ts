import {
  AbstractNotificationService,
  Address,
  LineItem,
  Order,
  OrderService,
} from "@medusajs/medusa";
import { EntityManager } from "typeorm";
import { AsyncParser } from "@json2csv/node";
import { MailerSend, Recipient, EmailParams } from "mailersend";
// Importar las utilidades
import { formatMoney, formatDate } from "../utils/format-utils";

import OrderNotificationService, {
  MailerSendOrderData,
} from "./order-notification";
import { OrderInvoice } from "../types/order-invoice.model";
import { EmailNotification } from "../types/email-notification.model";

class ReceiptNotificationService extends AbstractNotificationService {
  protected manager_: EntityManager;
  protected transactionManager_: EntityManager;
  static identifier = "receipt-notification";
  static is_installed = true;
  protected config: any;
  private mailerSendService: MailerSend;
  private orderNotificationService: OrderNotificationService;
  constructor(container, options) {
    super(container);
    this.orderNotificationService = new OrderNotificationService(container);

    console.log("[NOTIFICATION] Order sender service initialized");

    try {
      this.mailerSendService = new MailerSend({
        apiKey: process.env.MAILERSEND_API_KEY,
      });
      console.log(
        "[NOTIFICATION] MailerSend client initialized successfully for order notifications"
      );
    } catch (error) {
      console.error(
        "[NOTIFICATION] Error initializing MailerSend client for orders:",
        error
      );
    }
  }

  // El método getTemplateData ha sido trasladado a OrderNotificationService

  async buildCSVAttachment(order: Order) {
    const orderInvoice = new OrderInvoice(order);
    const itemFields = [
      { label: "title", value: "variant.title" },
      { label: "sku", value: "variant.sku" },
      { label: "quantity", value: "quantity" },
      { label: "unit_price_ex_tax", value: "unit_price_ex_tax" },
      { label: "unit_price", value: "unit_price" },
      { label: "subtotal", value: "totals.subtotal" },
      { label: "discount_total", value: "totals.discount_total" },
      { label: "total", value: "totals.total" },
      { label: "ref", value: "variant.barcode" },
    ];

    const customer = [
      {
        customer:
          orderInvoice.getBillingCompanyName() ||
          orderInvoice.getCustomerName().toLocaleUpperCase(),
      },
      {
        customer: orderInvoice.getBillingAddress().toLocaleUpperCase(),
      },
      {
        customer:
          `${orderInvoice.getBillingPostalCode()} ${orderInvoice.getBillingCityCountry()}`.toLocaleUpperCase(),
      },
      {
        customer: `${orderInvoice.getCustomerNifCif()}`,
      },
      {
        customer: formatDate(order.created_at),
      },
    ];
    const currencyCode = order.currency_code?.toUpperCase();
    const customerFields = [{ label: "customer", value: "customer" }];

    const itemOpts = { fields: itemFields, delimiter: ";" };
    const customerOpts = { fields: customerFields, delimiter: ";" };

    const itemParser = new AsyncParser(itemOpts);
    const customerParser = new AsyncParser(customerOpts);

    const orderItems = order.items.map((item: LineItem) => ({
      ...item,
      unit_price_ex_tax: formatMoney(
        item.subtotal / item.quantity,
        currencyCode
      ),
      unit_price: formatMoney(item.total / item.quantity, currencyCode),
      totals: {
        subtotal: formatMoney(item.subtotal, currencyCode),
        discount_total: formatMoney(item.discount_total, currencyCode),
        total: formatMoney(item.total, currencyCode),
      },
    }));

    const itemsCsv = await itemParser.parse(orderItems).promise();
    const customerCsv = await customerParser.parse(customer).promise();
    const shippingMethodCsv = orderInvoice.buildShippingMethodCsv();
    const csvContent = `${customerCsv}\n\n${itemsCsv}\n${shippingMethodCsv}`;
    const csvContentSanitized = csvContent.replace(/ €/g, "");

    return Buffer.from(csvContentSanitized).toString("base64");
  }

  async sendNotification(
    event: string,
    data: Order,
    attachmentGenerator?: unknown
  ): Promise<{
    to: string;
    status: string;
    data: Record<string, unknown>;
  }> {
    try {
      const orderData: Order =
        await this.orderNotificationService.retrieveOrderWithRelations(
          (data as Order).id as string
        );

      const {
        to_email,
        to_name,
        data: templateData,
      } = this.orderNotificationService.getTemplateData(orderData);

      // Comprobar si tenemos los datos necesarios
      if (!to_email) {
        throw new Error("Recipient email is required");
      }

      if (!process.env.MAILERSEND_ORDER_PLACED_TEMPLATE_ID) {
        throw new Error(`No template found for event ${event}`);
      }

      const emailNotification = new EmailNotification({
        toEmail: to_email,
        toName: to_name,
        templateId: process.env.MAILERSEND_ORDER_PLACED_TEMPLATE_ID,
        templateData,
      });

      const emailParams = emailNotification.getEmailParams();

      await this.mailerSendService.email.send(emailParams);

      emailNotification.setToEmail(
        process.env.MAILERSEND_ADMIN_EMAIL || "equipo@cartago4x4.es"
      );

      const emailAdminParams = emailNotification.getEmailParams();
      const csvContent = await this.buildCSVAttachment(orderData);
      emailAdminParams.setAttachments([
        {
          content: csvContent,
          filename: `Cartago4x4_invoice_${orderData.display_id}.csv`,
          disposition: "attachment",
        },
      ]);
      await this.mailerSendService.email.send(emailAdminParams);

      console.log(
        `[NOTIFICATION] Successfully sent ${event} email to ${to_email} for order ${templateData.display_id}`
      );

      return {
        to: to_email,
        status: "sent",
        data: orderData as unknown as Record<string, unknown>,
      };
    } catch (error) {
      console.error(`[NOTIFICATION] Error sending ${event} email:`, error);

      return {
        to: data.email,
        status: "failed",
        data: data as unknown as Record<string, unknown>,
      };
    }
  }

  async sendNotificationToAdmin(event: string, order: Order, status: any) {
    const { data: templateData } =
      this.orderNotificationService.getTemplateData(order);

    const csvContent = await this.buildCSVAttachment(order);

    const adminEmail =
      process.env.MAILERSEND_ADMIN_EMAIL || "equipo@cartago4x4.com";

    const emailNotification = new EmailNotification({
      toEmail: adminEmail,
      toName: process.env.MAILERSEND_SENDER_NAME || "Cartago4x4",
      templateId: process.env.MAILERSEND_ORDER_PLACED_TEMPLATE_ID,
      templateData,
    });

    const emailAdminParams = emailNotification.getEmailParams();

    emailAdminParams.setAttachments([
      {
        content: csvContent,
        filename: `Cartago4x4_invoice_${order.display_id}.csv`,
        disposition: "attachment",
      },
    ]);

    await this.mailerSendService.email
      .send(emailAdminParams)
      .then(() => "sent")
      .catch(() => "failed");

    console.log(
      `[NOTIFICATION] Successfully sent ${order.display_id} email to ${adminEmail}`
    );

    return {
      to: adminEmail,
      status,
      data: emailAdminParams as unknown as Record<string, unknown>,
    };
  }

  async resendNotification(
    notification: unknown,
    config: unknown,
    attachmentGenerator: unknown
  ): Promise<{
    to: string;
    status: string;
    data: Record<string, unknown>;
  }> {
    const typedNotification = notification as any;
    const typedConfig = config as any;
    const to: string = typedConfig.to_email
      ? typedConfig.to_email
      : typedNotification.to;

    if (typedConfig.to_email && typedConfig.to_email !== typedNotification.to) {
      // Si hay un nuevo destinatario, reenvía la notificación
      const updatedData = {
        ...typedNotification.data,
        email: typedConfig.to_email,
      };

      return this.sendNotification(
        typedNotification.event_name,
        updatedData,
        attachmentGenerator
      );
    }

    return {
      to,
      status: "done",
      data: typedNotification.data as Record<string, unknown>,
    };
  }
}

export default ReceiptNotificationService;
