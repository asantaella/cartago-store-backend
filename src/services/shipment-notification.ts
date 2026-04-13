import { Fulfillment, Order, PaymentStatus } from "@medusajs/medusa";
import AbstractBrevoEmailNotification from "./abstract-brevo-email-notification";
import EmailTemplateCompiler from "./email-template-compiler";
import InvoicePdfGeneratorService from "./invoice-pdf-generator";
import ShipmentTemplateNotificationService, {
  ShipmentNotificationTemplateData,
} from "./shipment-template-notification";

type ShipmentNotificationSource =
  | Order
  | {
      id?: string;
      order_id?: string;
      fulfillment_id?: string;
      order?: Order;
      fulfillment?: Fulfillment;
    };

type ShipmentTemplateName = "invoice-created" | "shipment-created";

type ShipmentNotificationOptions = {
  templateName?: ShipmentTemplateName;
  showTrackingDeliverySection?: boolean;
};

type ShipmentNotificationContext = {
  order: Order;
  fulfillment?: Fulfillment;
};

class ShipmentNotificationService extends AbstractBrevoEmailNotification {
  static identifier = "shipment-notification";
  static is_installed = true;

  protected shipmentTemplateService: ShipmentTemplateNotificationService;

  protected invoicePdfGeneratorService: InvoicePdfGeneratorService;

  constructor(container, options) {
    super();
    this.shipmentTemplateService = new ShipmentTemplateNotificationService(
      container,
    );
    this.invoicePdfGeneratorService = container.invoicePdfGeneratorService;
  }

  async buildPDFAttachment(
    order: Order,
  ): Promise<{ content: string; filename: string }> {
    const invoiceData = await this.invoicePdfGeneratorService.generateInvoice(
      order.id,
    );

    return {
      content: invoiceData.buffer.toString("base64"),
      filename: invoiceData.fileName,
    };
  }

  private isOrderLike(source: ShipmentNotificationSource): source is Order {
    return Boolean(
      source &&
      typeof source === "object" &&
      "display_id" in source &&
      "shipping_address" in source &&
      "items" in source,
    );
  }

  private async resolveShipmentContext(
    source: ShipmentNotificationSource,
  ): Promise<ShipmentNotificationContext> {
    if (this.isOrderLike(source)) {
      return { order: source };
    }

    if (source.order) {
      if (Array.isArray(source.order.fulfillments)) {
        return {
          order: source.order,
          fulfillment: source.fulfillment,
        };
      }

      const hydratedOrder =
        await this.shipmentTemplateService.retrieveOrderWithRelations(
          source.order.id,
          ["fulfillments", "fulfillments.tracking_links"],
        );

      return {
        order: hydratedOrder,
        fulfillment:
          source.fulfillment ||
          hydratedOrder.fulfillments?.find(
            (item) => item.id === source.fulfillment?.id,
          ),
      };
    }

    const orderId = source.order_id || source.id;

    if (!orderId) {
      throw new Error("Invalid data structure for shipment notification");
    }

    const order = await this.shipmentTemplateService.retrieveOrderWithRelations(
      orderId,
      ["fulfillments", "fulfillments.tracking_links"],
    );

    const fulfillment =
      source.fulfillment_id &&
      order.fulfillments?.find((item) => item.id === source.fulfillment_id);

    return {
      order,
      fulfillment,
    };
  }

  private buildTemplateData(
    order: Order,
    fulfillment?: Fulfillment,
    showTrackingDeliverySection = true,
  ): ShipmentNotificationTemplateData {
    const { data: templateData } =
      this.shipmentTemplateService.getShipmentTemplateData(
        "shipment.created",
        order,
        fulfillment,
      );

    if (!templateData) {
      throw new Error("Shipment template data is required");
    }

    return {
      ...templateData,
      first_name: templateData.first_name || templateData.customer.first_name,
      showTrackingDeliverySection,
    };
  }

  private renderTemplate(
    templateName: ShipmentTemplateName,
    templateData: ShipmentNotificationTemplateData,
  ): string {
    const html = EmailTemplateCompiler.renderTemplate(
      templateName,
      templateData,
    );

    if (!html) {
      throw new Error(`Failed to render ${templateName} template`);
    }

    return html;
  }

  private buildSubject(
    templateName: ShipmentTemplateName,
    templateData: ShipmentNotificationTemplateData,
  ): string {
    const firstName =
      templateData.first_name || templateData.customer.first_name;

    if (templateName === "invoice-created") {
      return `${firstName}, su factura está disponible`;
    }

    return `${firstName}, tu pedido ${templateData.display_id} ha sido enviado`;
  }

  private async sendTemplateEmail(
    recipientEmail: string,
    recipientName: string | undefined,
    templateName: ShipmentTemplateName,
    templateData: ShipmentNotificationTemplateData,
    tags: string[],
    attachment?: { content: string; filename: string },
  ): Promise<void> {
    const html = this.renderTemplate(templateName, templateData);
    const payload = this.buildEmailPayload(
      recipientEmail,
      this.buildSubject(templateName, templateData),
      html,
      tags,
      recipientName,
      attachment
        ? [
            {
              content: attachment.content,
              name: attachment.filename,
            },
          ]
        : undefined,
    );

    await this.sendEmailWithRetry(
      payload,
      `${templateName} email for order ${templateData.display_id}`,
    );
  }

  async sendEmailCustomer(..._args: any[]): Promise<void> {
    return;
  }

  async sendEmailAdmin(..._args: any[]): Promise<void> {
    return;
  }

  async sendInvoiceNotification(
    source: ShipmentNotificationSource,
    options: ShipmentNotificationOptions = {},
  ): Promise<{
    to: string;
    status: string;
    data: Record<string, unknown>;
  }> {
    try {
      const { order, fulfillment } = await this.resolveShipmentContext(source);
      const { to_email, to_name } =
        this.shipmentTemplateService.getShipmentTemplateData(
          "shipment.created",
          order,
          fulfillment,
        );

      if (!to_email) {
        throw new Error("Recipient email is required");
      }

      const templateData = this.buildTemplateData(
        order,
        fulfillment,
        options.showTrackingDeliverySection ?? true,
      );
      const attachment = await this.buildPDFAttachment(order);

      await this.sendTemplateEmail(
        to_email,
        to_name,
        "invoice-created",
        templateData,
        ["invoice-created", "customer-notification"],
        attachment,
      );

      const adminEmail =
        process.env.ADMIN_EMAIL || process.env.MAILERSEND_ADMIN_EMAIL;

      if (adminEmail) {
        await this.sendTemplateEmail(
          adminEmail,
          process.env.MAILERSEND_SENDER_NAME || "Cartago4x4",
          "invoice-created",
          templateData,
          ["invoice-created", "admin-notification"],
          attachment,
        );
      }

      return {
        to: to_email,
        status: "sent",
        data: order as unknown as Record<string, unknown>,
      };
    } catch (error) {
      console.error(
        "[NOTIFICATION] Error sending invoice-created email:",
        error,
      );

      return {
        to: "unknown",
        status: "failed",
        data: source as unknown as Record<string, unknown>,
      };
    }
  }

  async sendShipmentNotification(
    source: ShipmentNotificationSource,
    options: ShipmentNotificationOptions = {},
  ): Promise<{
    to: string;
    status: string;
    data: Record<string, unknown>;
  }> {
    try {
      const { order, fulfillment } = await this.resolveShipmentContext(source);
      const { to_email, to_name } =
        this.shipmentTemplateService.getShipmentTemplateData(
          "shipment.created",
          order,
          fulfillment,
        );

      if (!to_email) {
        throw new Error("Recipient email is required");
      }

      const templateData = this.buildTemplateData(
        order,
        fulfillment,
        options.showTrackingDeliverySection ?? true,
      );

      await this.sendTemplateEmail(
        to_email,
        to_name,
        "shipment-created",
        templateData,
        ["shipment-created", "customer-notification"],
      );

      const adminEmail =
        process.env.ADMIN_EMAIL || process.env.MAILERSEND_ADMIN_EMAIL;

      if (adminEmail) {
        await this.sendTemplateEmail(
          adminEmail,
          process.env.MAILERSEND_SENDER_NAME || "Cartago4x4",
          "shipment-created",
          templateData,
          ["shipment-created", "admin-notification"],
        );
      }

      return {
        to: to_email,
        status: "sent",
        data: order as unknown as Record<string, unknown>,
      };
    } catch (error) {
      console.error(
        "[NOTIFICATION] Error sending shipment-created email:",
        error,
      );

      return {
        to: "unknown",
        status: "failed",
        data: source as unknown as Record<string, unknown>,
      };
    }
  }

  async sendNotification(
    event: string,
    data: ShipmentNotificationSource,
    options: ShipmentNotificationOptions = {},
  ): Promise<{
    to: string;
    status: string;
    data: Record<string, unknown>;
  }> {
    const { order } = await this.resolveShipmentContext(data);

    if (
      options.templateName === "invoice-created" ||
      order.payment_status === PaymentStatus.CAPTURED
    ) {
      return this.sendInvoiceNotification(data, options);
    }

    return this.sendShipmentNotification(data, options);
  }
}

export default ShipmentNotificationService;
