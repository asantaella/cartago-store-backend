import {
  AbstractNotificationService,
  Address,
  LineItem,
  Order,
} from "@medusajs/medusa";
import { EntityManager } from "typeorm";
import { AsyncParser } from "@json2csv/node";
import { MailerSend, Recipient, EmailParams } from "mailersend";
// Importar las utilidades
import { formatMoney, formatDate } from "../utils/format-utils";
import { buildShippingMethodCsv } from "../utils/order-utils";
import OrderNotificationService, {  
  MailerSendOrderData,
} from "./order-notification";

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
    // Inicializar la configuración
    this.config = {
      order_placed_url: process.env.MAILERSEND_ORDER_PLACED_URL,
      support_url: process.env.MAILERSEND_SUPPORT_URL,
      account_name: process.env.MAILERSEND_SENDER_NAME,
      company_name: process.env.MAILERSEND_COMPANY_NAME,
      sender_name: process.env.MAILERSEND_SENDER_NAME,
      sender_email: process.env.MAILERSEND_SENDER_EMAIL,
      sender_address: process.env.MAILERSEND_SENDER_ADDRESS,
      admin_email: process.env.MAILERSEND_ADMIN_EMAIL,
      template_overrides: {
        "order.placed": process.env.MAILERSEND_ORDER_PLACED_TEMPLATE_ID,
      },
    };

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

    const customerInfo: Address =
      order.billing_address || order.shipping_address;

    const customer = [
      {
        customer:
          `${customerInfo.first_name} ${customerInfo.last_name}`.toLocaleUpperCase(),
      },
      {
        customer:
          `${customerInfo.address_1} ${customerInfo.address_2}`.toLocaleUpperCase(),
      },
      {
        customer:
          `${customerInfo.postal_code} ${customerInfo.city}, ${customerInfo.province}`.toLocaleUpperCase(),
      },
      {
        customer: `${
          customerInfo?.metadata?.nif_cif || order?.customer?.metadata?.nif_cif
        }`,
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
    const shippingMethodCsv = buildShippingMethodCsv(order);
    const csvContent = `${customerCsv}\n\n${itemsCsv}\n${shippingMethodCsv}`;
    const csvContentSanitized = csvContent.replace(/ €/g, "");

    //console.log("CSV created..", csvContentSanitized);
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
      // console.log(
      //   `[NOTIFICATION] Processing ${event} for order ${orderData.display_id}`
      // );
      console.log("ORDER DATA:\n", JSON.stringify(orderData));
      const {
        to_email,
        to_name,
        template_id,
        data: templateData,
      } = this.orderNotificationService.getTemplateData(event, orderData);

      // Comprobar si tenemos los datos necesarios
      if (!to_email) {
        throw new Error("Recipient email is required");
      }

      if (!template_id) {
        throw new Error(`No template found for event ${event}`);
      }

      const recipients = [new Recipient(to_email, to_name)];

      // Crear parámetros de email
      const emailParams = new EmailParams()
        .setFrom({
          email: this.config.sender_email || "equipo@cartago4x4.es",
          name: this.config.sender_name || "Cartago 4x4",
        })
        .setTo(recipients)
        .setTemplateId(template_id)
        .setPersonalization([
          {
            email: to_email,
            data: templateData,
          },
        ]);

      await this.mailerSendService.email.send(emailParams);

      await this.sendNotificationToAdmin(
        orderData,
        emailParams,
        templateData,
        "sent"
      );

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

  async sendNotificationToAdmin(
    order: Order,
    emailParams: EmailParams,
    templateData: MailerSendOrderData,
    status: any
  ) {
    const csvContent = await this.buildCSVAttachment(order);
    const recipients = [
      new Recipient(this.config.admin_email, this.config.sender_name),
    ];
    const emailAdminParams = emailParams
      .setTo(recipients)
      .setPersonalization([
        {
          email: this.config.admin_email,
          data: templateData,
        },
      ])
      .setAttachments([
        {
          content: csvContent,
          filename: `Cartago4x4_invoice_${order.display_id}.csv`,
          disposition: "attachment",
        },
      ]);

    console.log("Email admin params\n", emailAdminParams);
    await this.mailerSendService.email
      .send(emailAdminParams)
      .then(() => "sent")
      .catch(() => "failed");

    console.log(
      `[NOTIFICATION] Successfully sent ${order.display_id} email to ${this.config.admin_email}`
    );

    return {
      to: this.config.admin_email,
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
