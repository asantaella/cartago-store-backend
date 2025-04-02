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
import { formatMoney, formatDate, formatAddress } from "../utils/format-utils";
import {
  getCustomerNifCif,
  getShippingMethodName,
  buildShippingMethodCsv,
} from "../utils/order-utils";

interface MailerSendOrderPlacedNotification {
  to_email: string;
  from_email: string;
  to_name: string;
  template_id: string;
  data?: MailerSendOrderData;
}

interface MailerSendOrderData {
  company_name: string;
  display_id: number;
  order_date: string;
  customer: {
    first_name: string;
    last_name: string;
    full_name: string;
    email: string;
    phone?: string;
    nif_cif?: string;
  };
  shipping_address: string;
  billing_address?: string;
  shipping_method: string;
  shipping_total: string;
  currency: string;
  subtotal_ex_tax: string;
  subtotal: string;
  tax_total: string;
  tax_rate?: number;
  total: string;
  items: Array<{
    title: string;
    quantity: number;
    variant: string;
    price: string;
    ref: string;
    sku?: string;
    unit_price_ex_tax: string;
    unit_price: string;
    totals: {
      tax_total: string;
      discount_total: string;
      subtotal: string;
      total: string;
    };
  }>;
  discount_total?: string;
  order_url?: string;
}

class OrderSenderService extends AbstractNotificationService {
  protected manager_: EntityManager;
  protected transactionManager_: EntityManager;
  static identifier = "order-sender";
  static is_installed = true;
  protected config: any;
  protected orderService: OrderService;
  private mailerSendService: MailerSend;

  constructor(container, options) {
    super(container);
    this.orderService = container.orderService;
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

  private getTemplateData(
    event: string,
    order: Order
  ): MailerSendOrderPlacedNotification {
    if (!order || typeof order !== "object") {
      return {
        to_email: "",
        from_email: "",
        to_name: "",
        template_id: "",
        data: undefined,
      };
    }

    const templateId = this.config?.template_overrides?.[event];
    const currencyCode = order.currency_code?.toUpperCase();

    if (!templateId) {
      console.warn(`[NOTIFICATION] No template ID found for event: ${event}`);
    }

    const formattedItems =
      order.items?.map((item: LineItem) => ({
        title: item.title,
        quantity: item.quantity,
        variant: item.variant?.title || "",
        price: formatMoney(item.unit_price * item.quantity, currencyCode),
        ref: item.variant.barcode,
        sku: item.variant ? item.variant.sku : undefined,
        unit_price_ex_tax: formatMoney(
          item.subtotal / item.quantity,
          currencyCode
        ),
        unit_price: formatMoney(item.total / item.quantity, currencyCode),
        totals: {
          tax_total: formatMoney(item.tax_total, currencyCode),
          discount_total: formatMoney(item.discount_total, currencyCode),
          subtotal: formatMoney(item.subtotal, currencyCode),
          total: formatMoney(item.total, currencyCode),
        },
      })) || [];

    return {
      to_email: order.email,
      from_email: this.config.sender_email,
      to_name: `${order.shipping_address?.first_name} ${order.shipping_address?.last_name}`,
      template_id: templateId,
      data: {
        company_name: this.config.company_name,
        display_id: order?.display_id,
        order_date: formatDate(order.created_at),
        customer: {
          first_name: order.shipping_address?.first_name,
          last_name: order.shipping_address?.last_name,
          full_name: `${order.shipping_address?.first_name} ${order.shipping_address?.last_name}`,
          email: order.email,
          phone: order.shipping_address?.phone,
          nif_cif: getCustomerNifCif(order),
        },
        shipping_address: formatAddress(order.shipping_address),
        billing_address: formatAddress(order.billing_address),
        shipping_method: getShippingMethodName(order),
        shipping_total: formatMoney(order.shipping_total, currencyCode),

        currency: currencyCode,
        subtotal_ex_tax: formatMoney(order.subtotal, currencyCode),
        subtotal: formatMoney(
          order.subtotal + order.tax_total || 0,
          currencyCode
        ),
        tax_total: formatMoney(order.tax_total || 0, currencyCode),
        tax_rate: order.region?.tax_rate,
        discount_total: formatMoney(order.discount_total || 0, currencyCode),
        total: formatMoney(order.total, currencyCode),
        items: formattedItems,

        // URL para ver el pedido (si existe)
        order_url: this.config.order_placed_url
          ? `${this.config.order_placed_url}?id=${order.id}`
          : undefined,
      },
    };
  }

  async buildCSVAttachment(order: Order) {
    const itemFields = [
      { label: "title", value: "title" },
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
      const orderData: Order = await this.orderService.retrieve(
        (data as Order).id as string,
        {
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
          ],
          select: [
            "subtotal",
            "tax_total",
            "shipping_total",
            "discount_total",
            "total",
            "paid_total",
          ],
        }
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
      } = this.getTemplateData(event, orderData);

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

export default OrderSenderService;
