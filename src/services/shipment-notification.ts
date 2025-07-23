import {
  AbstractNotificationService,
  Order,
  OrderService,
  Fulfillment,
  FulfillmentService,
} from "@medusajs/medusa";
import { EntityManager } from "typeorm";
import { MailerSend, Recipient, EmailParams } from "mailersend";
import InvoicePdfGeneratorService from "./invoice-pdf-generator";
import OrderNotificationService from "./order-notification";

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

  // El método getTemplateData para envíos ahora está en OrderNotificationService como getShipmentTemplateData

  async buildPDFAttachment(order: Order): Promise<string> {
    try {
      const invoiceData =
        (await this.invoicePdfGeneratorService.generateInvoice(
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

      const orderData: Order =
        await this.orderNotificationService.retrieveOrderWithRelations(
          orderId,
          ["fulfillments", "fulfillments.tracking_links"]
        );

      console.log(
        `[NOTIFICATION] Processing ${event} for order FULLFILLMENTS ${JSON.stringify(
          orderData.fulfillments
        )}`
      );

      console.log(
        `[NOTIFICATION] Processing ${event} for order ${orderData.display_id}`
      );

      const {
        to_email,
        to_name,
        template_id,
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

export default ShipmentNotificationService;
