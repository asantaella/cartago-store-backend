import {
  AbstractNotificationService,
  Address,
  LineItem,
  Order,
  OrderService,
  Fulfillment,
  FulfillmentService,
  TrackingLink,
} from "@medusajs/medusa";
import { EntityManager } from "typeorm";
import { MailerSend, Recipient, EmailParams } from "mailersend";
// Importar las utilidades
import { formatMoney, formatDate, formatAddress } from "../utils/format-utils";
import { getCustomerNifCif, getShippingMethodName } from "../utils/order-utils";
import InvoiceGeneratorService from "./invoice-generator";

interface MailerSendShipmentNotification {
  to_email: string;
  from_email: string;
  to_name: string;
  template_id: string;
  data?: MailerSendShipmentData;
}

interface MailerSendShipmentData {
  company_name: string;
  display_id: number;
  order_date: string;
  shipment_date: string;
  tracking_links?: Pick<TrackingLink, "tracking_number" | "url">[];
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

class ShipmentSenderService extends AbstractNotificationService {
  protected manager_: EntityManager;
  protected transactionManager_: EntityManager;
  static identifier = "shipment-sender";
  static is_installed = true;
  protected config: any;
  protected orderService: OrderService;
  protected fulfillmentService: FulfillmentService;
  protected invoiceGeneratorService: InvoiceGeneratorService;
  private mailerSendService: MailerSend;

  constructor(container, options) {
    super(container);
    this.orderService = container.orderService;
    this.fulfillmentService = container.fulfillmentService;
    this.invoiceGeneratorService = container.invoiceGeneratorService;

    // Inicializar la configuración
    this.config = {
      //shipment_created_url: process.env.MAILERSEND_SHIPMENT_CREATED_URL,
      support_url: process.env.MAILERSEND_SUPPORT_URL,
      account_name: process.env.MAILERSEND_SENDER_NAME,
      company_name: process.env.MAILERSEND_COMPANY_NAME,
      sender_name: process.env.MAILERSEND_SENDER_NAME,
      sender_email: process.env.MAILERSEND_SENDER_EMAIL,
      sender_address: process.env.MAILERSEND_SENDER_ADDRESS,
      admin_email: process.env.MAILERSEND_ADMIN_EMAIL,
      template_overrides: {
        [OrderService.Events.SHIPMENT_CREATED]:
          process.env.MAILERSEND_SHIPMENT_CREATED_TEMPLATE_ID,
      },
    };

    console.log("[NOTIFICATION] Shipment sender service initialized");

    try {
      this.mailerSendService = new MailerSend({
        apiKey: process.env.MAILERSEND_API_KEY,
      });
      console.log(
        "[NOTIFICATION] MailerSend client initialized successfully for shipment notifications"
      );
    } catch (error) {
      console.error(
        "[NOTIFICATION] Error initializing MailerSend client for shipments:",
        error
      );
    }
  }

  private getTemplateData(
    event: string,
    order: Order,
    fulfillment?: Fulfillment
  ): MailerSendShipmentNotification {
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
        ref: item.variant.barcode || "S/N",
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
        order_date: formatDate(order.created_at || new Date()),
        shipment_date: formatDate(
          fulfillment?.shipped_at || fulfillment?.created_at || new Date()
        ),
        tracking_links:
          fulfillment?.tracking_links.map((tl) => ({
            ...tl,
            url:
              `https://www.correos.es/es/es/herramientas/localizador/envios/detalle?tracking-number=${tl.tracking_number}` ||
              "https://www.correos.es/es/es/herramientas/localizador/envios",
          })) || [],
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
        // order_url: this.config.shipment_created_url
        //   ? `${this.config.shipment_created_url}?id=${order.id}`
        //   : undefined,
      },
    };
  }

  async buildPDFAttachment(order: Order): Promise<string> {
    try {
      const invoiceData = (await this.invoiceGeneratorService.generateInvoice(
        order.id
      )) as any;
      return invoiceData.buffer.toString("base64");
    } catch (error) {
      console.error("[NOTIFICATION] Error generating PDF invoice:", error);
      throw error;
    }
  }

  async sendNotification(
    event: string,
    data: any,
    attachmentGenerator?: unknown
  ): Promise<{
    to: string;
    status: string;
    data: Record<string, unknown>;
  }> {
    try {
      // Los datos pueden venir como fulfillment o order dependiendo del evento
      let orderId: string;
      let fulfillment: Fulfillment | undefined;

      if (data.order_id) {
        // Es un fulfillment
        orderId = data.order_id;
        fulfillment = data;
      } else if (data.id) {
        // Es una orden
        orderId = data.id;
      } else {
        throw new Error("Invalid data structure for shipment notification");
      }

      const orderData: Order = await this.orderService.retrieve(orderId, {
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
          "fulfillments",
          "fulfillments.tracking_links",
        ],
        select: [
          "subtotal",
          "tax_total",
          "shipping_total",
          "discount_total",
          "total",
          "paid_total",
        ],
      });

      console.log(
        `[NOTIFICATION] Processing ${event} for order ${orderData.display_id}`
      );

      const {
        to_email,
        to_name,
        template_id,
        data: templateData,
      } = this.getTemplateData(event, orderData, fulfillment);

      // Comprobar si tenemos los datos necesarios
      if (!to_email) {
        throw new Error("Recipient email is required");
      }

      if (!template_id) {
        throw new Error(`No template found for event ${event}`);
      }

      const recipients = [new Recipient(to_email, to_name)];

      // Generar PDF de la factura
      const pdfContent = await this.buildPDFAttachment(orderData);

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
        ])
        .setAttachments([
          {
            content: pdfContent,
            filename: `Cartago4x4_factura_${orderData.display_id}.pdf`,
            disposition: "attachment",
          },
        ]);

      await this.mailerSendService.email.send(emailParams);

      console.log(
        `[NOTIFICATION] Successfully sent ${event} email with invoice to ${to_email} for order ${templateData.display_id}`
      );

      return {
        to: to_email,
        status: "sent",
        data: orderData as unknown as Record<string, unknown>,
      };
    } catch (error) {
      console.error(`[NOTIFICATION] Error sending ${event} email:`, error);

      return {
        to: data.email || "unknown",
        status: "failed",
        data: data as unknown as Record<string, unknown>,
      };
    }
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

export default ShipmentSenderService;
