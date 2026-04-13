import {
  Fulfillment,
  Order,
  OrderService,
  PaymentStatus,
} from "@medusajs/medusa";
import AbstractBrevoEmailNotification from "./abstract-brevo-email-notification";
import EmailTemplateCompiler from "./email-template-compiler";
import InvoicePdfGeneratorService from "./invoice-pdf-generator";
import ShipmentTemplateNotificationService, {
  ShipmentNotificationTemplateData,
} from "./shipment-template-notification";

type ShipmentCreatedEventData = {
  id?: string;
  fulfillment_id?: string;
  order_id?: string;
};

class ShipmentCreatedNotificationService extends AbstractBrevoEmailNotification {
  private shipmentTemplateService: ShipmentTemplateNotificationService;

  private invoicePdfGeneratorService: InvoicePdfGeneratorService;

  constructor(container) {
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

  private async resolveShipmentContext(
    data: ShipmentCreatedEventData,
  ): Promise<{
    order: Order;
    fulfillment?: Fulfillment;
    toEmail: string;
    toName: string;
    templateData: ShipmentNotificationTemplateData;
  }> {
    const orderId = data.order_id || data.id;

    if (!orderId) {
      throw new Error("Invalid data structure for shipment notification");
    }

    const order = await this.shipmentTemplateService.retrieveOrderWithRelations(
      orderId,
      ["fulfillments", "fulfillments.tracking_links"],
    );

    const fulfillment =
      data.fulfillment_id &&
      order.fulfillments?.find((item) => item.id === data.fulfillment_id);

    if (order.payment_status !== PaymentStatus.CAPTURED) {
      throw new Error(
        `Order ${order.display_id} is not eligible for shipment email because payment is not captured`,
      );
    }

    const {
      to_email,
      to_name,
      data: templateData,
    } = this.shipmentTemplateService.getShipmentTemplateData(
      OrderService.Events.SHIPMENT_CREATED,
      order,
      fulfillment,
    );

    if (!to_email) {
      throw new Error("Recipient email is required");
    }

    if (!templateData) {
      throw new Error("Shipment template data is required");
    }

    return {
      order,
      fulfillment,
      toEmail: to_email,
      toName: to_name,
      templateData,
    };
  }

  private renderShipmentTemplate(
    templateData: ShipmentNotificationTemplateData,
  ): string {
    const html = EmailTemplateCompiler.renderTemplate(
      "shipment-created",
      templateData,
    );

    if (!html) {
      throw new Error("Failed to render shipment-create template");
    }

    return html;
  }

  private async sendShipmentEmail(
    email: string,
    subject: string,
    templateData: ShipmentNotificationTemplateData,
    attachment: { content: string; filename: string },
    tags: string[],
    context: string,
    name?: string,
  ): Promise<void> {
    const html = this.renderShipmentTemplate(templateData);
    const payload = this.buildEmailPayload(email, subject, html, tags, name, [
      {
        content: attachment.content,
        name: attachment.filename,
      },
    ]);

    await this.sendEmailWithRetry(payload, context);
  }

  async sendEmailCustomer(
    toEmail: string,
    toName: string,
    templateData: ShipmentNotificationTemplateData,
    attachment: { content: string; filename: string },
  ): Promise<void> {
    await this.sendShipmentEmail(
      toEmail,
      `Tu pedido #${templateData.display_id} ha sido enviado`,
      templateData,
      attachment,
      ["shipment-created", "customer-notification"],
      `Shipment created customer notification for order ${templateData.display_id}`,
      toName,
    );
  }

  async sendEmailAdmin(
    templateData: ShipmentNotificationTemplateData,
    attachment: { content: string; filename: string },
  ): Promise<void> {
    const adminEmail =
      process.env.ADMIN_EMAIL || process.env.MAILERSEND_ADMIN_EMAIL;

    if (!adminEmail) {
      return;
    }

    await this.sendShipmentEmail(
      adminEmail,
      `[Copia] Pedido enviado #${templateData.display_id}`,
      templateData,
      attachment,
      ["shipment-created", "admin-notification"],
      `Shipment created admin notification for order ${templateData.display_id}`,
    );
  }

  async sendNotification(
    event: string,
    data: ShipmentCreatedEventData,
  ): Promise<{
    to: string;
    status: string;
    data: Record<string, unknown>;
  }> {
    try {
      const { order, fulfillment, toEmail, toName, templateData } =
        await this.resolveShipmentContext(data);

      const attachment = await this.buildPDFAttachment(order);

      await this.sendEmailCustomer(toEmail, toName, templateData, attachment);
      await this.sendEmailAdmin(templateData, attachment);

      return {
        to: order.email,
        status: "sent",
        data: order as unknown as Record<string, unknown>,
      };
    } catch (error) {
      console.error(
        `[ShipmentCreatedNotificationService] Error sending ${event} email:`,
        error,
      );

      return {
        to: data.order_id || data.id || "unknown",
        status: "failed",
        data: data as unknown as Record<string, unknown>,
      };
    }
  }
}

export default ShipmentCreatedNotificationService;
