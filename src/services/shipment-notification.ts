import {
  AbstractNotificationService,
  Order,
  OrderService,
  Fulfillment,
  FulfillmentService,
} from "@medusajs/medusa";
import { EntityManager } from "typeorm";
import { MailerSend, Recipient, EmailParams, Attachment } from "mailersend";
import InvoicePdfGeneratorService from "./invoice-pdf-generator";
import OrderNotificationService from "./order-notification";
import { EmailNotification } from "../types/email-notification.model";

class ShipmentNotificationService extends AbstractNotificationService {
  protected manager_: EntityManager;
  protected transactionManager_: EntityManager;
  static identifier = "shipment-notification";
  static is_installed = true;
  protected config: any;
  protected orderNotificationService: OrderNotificationService;
  protected invoicePdfGeneratorService: InvoicePdfGeneratorService;
  private mailerSendService: MailerSend;

  constructor(container, options) {
    super(container);
    this.orderNotificationService = new OrderNotificationService(container);
    this.invoicePdfGeneratorService = container.invoicePdfGeneratorService;

    try {
      this.mailerSendService = new MailerSend({
        apiKey: process.env.MAILERSEND_API_KEY,
      });    
    } catch (error) {
      console.error(
        "[NOTIFICATION] Error initializing MailerSend client for shipments:",
        error
      );
    }
  }

  // El método getTemplateData para envíos ahora está en OrderNotificationService como getShipmentTemplateData

  async buildPDFAttachment(
    order: Order
  ): Promise<{ content: string; filename: string }> {
    try {
      const invoiceData = await this.invoicePdfGeneratorService.generateInvoice(
        order.id
      );
      return {
        content: invoiceData.buffer.toString("base64"),
        filename: invoiceData.fileName,
      };
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

      const orderData: Order =
        await this.orderNotificationService.retrieveOrderWithRelations(
          orderId,
          ["fulfillments", "fulfillments.tracking_links"]
        );

      console.log(
        `[NOTIFICATION] Processing ${event} for order ${orderData.display_id}`
      );

      const {
        to_email,
        to_name,
        data: templateData,
      } = this.orderNotificationService.getShipmentTemplateData(
        event,
        orderData,
        fulfillment
      );

      // Comprobar si tenemos los datos necesarios
      if (!to_email) {
        throw new Error("Recipient email is required");
      }

      if (!process.env.MAILERSEND_SHIPMENT_CREATED_TEMPLATE_ID) {
        throw new Error(`No template found for event ${event}`);
      }

      const invoicePdf = await this.buildPDFAttachment(orderData);

      const emailNotification = new EmailNotification({
        toEmail: to_email,
        toName: to_name,
        templateId: process.env.MAILERSEND_SHIPMENT_CREATED_TEMPLATE_ID,
        templateData,
      });

      const attachments: Attachment[] = [
        {
          content: invoicePdf.content,
          filename: invoicePdf.filename,
          disposition: "attachment",
        },
      ];

      const emailParams = emailNotification.getEmailParams();

      emailParams.setAttachments(attachments);

       await this.mailerSendService.email.send(emailParams);

      emailNotification.setToEmail(
        process.env.MAILERSEND_ADMIN_EMAIL || "equipo@cartago4x4.es"
      );

      const emailAdminParams = emailNotification.getEmailParams();
      emailAdminParams.setAttachments(attachments);
      await this.mailerSendService.email.send(emailAdminParams);

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

export default ShipmentNotificationService;
