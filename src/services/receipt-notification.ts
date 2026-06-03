import {
  AbstractNotificationService,
  Order,
} from "@medusajs/medusa";
import { EntityManager } from "typeorm";
import { MailerSend } from "mailersend";

import OrderPlacedNotificationService from "./order-placed-notification";
import { EmailNotification } from "../types/email-notification.model";
import OrderCsvAttachmentService from "./order-csv-attachment";

class ReceiptNotificationService extends AbstractNotificationService {
  protected manager_: EntityManager;
  protected transactionManager_: EntityManager;
  static identifier = "receipt-notification";
  static is_installed = true;
  protected config: any;
  private mailerSendService: MailerSend;
  private orderNotificationService: OrderPlacedNotificationService;
  private orderCsvAttachmentService: OrderCsvAttachmentService;
  constructor(container, options) {
    super(container);
    this.orderNotificationService = new OrderPlacedNotificationService(
      container,
    );
    this.orderCsvAttachmentService = container.orderCsvAttachmentService;

    try {
      this.mailerSendService = new MailerSend({
        apiKey: process.env.MAILERSEND_API_KEY,
      });
    } catch (error) {
      console.error(
        "[NOTIFICATION] Error initializing MailerSend client for orders:",
        error,
      );
    }
  }

  // El método getTemplateData ha sido trasladado a OrderNotificationService

  async buildCSVAttachment(order: Order) {
    return this.orderCsvAttachmentService.buildCSVAttachment(order);
  }

  async sendNotification(
    event: string,
    data: Order,
    attachmentGenerator?: unknown,
  ): Promise<{
    to: string;
    status: string;
    data: Record<string, unknown>;
  }> {
    try {
      const orderData: Order =
        await this.orderNotificationService.retrieveOrderWithRelations(
          (data as Order).id as string,
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
      console.log(
        "[NOTIFICATION][RECEIPT] EmailNotification: ",
        emailNotification.toString(),
      );
      const emailParams = emailNotification.getEmailParams();
      console.log("[NOTIFICATION] [RECEIPT] ready to send ... ", to_email);
      await this.mailerSendService.email.send(emailParams);

      emailNotification.setToEmail(
        process.env.MAILERSEND_ADMIN_EMAIL || "cartago4x4@gmail.com",
      );

      const emailAdminParams = emailNotification.getEmailParams();

      console.log("[NOTIFICATION][RECEIPT] EmailNotification attachment ready");
      const csvContent = await this.buildCSVAttachment(orderData);
      emailAdminParams.setAttachments([
        {
          content: csvContent,
          filename: `Cartago4x4_invoice_${orderData.display_id}.csv`,
          disposition: "attachment",
        },
      ]);
      console.log("[NOTIFICATION][RECEIPT] sending to admin ...");
      await this.mailerSendService.email.send(emailAdminParams);

      console.log(
        `[NOTIFICATION][RECEIPT] Successfully sent ${event} email to ${to_email} for order ${templateData.display_id}`,
      );

      return {
        to: to_email,
        status: "sent",
        data: orderData as unknown as Record<string, unknown>,
      };
    } catch (error) {
      console.error(
        `[NOTIFICATION][RECEIPT] Error sending ${event} email:`,
        error,
      );

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
    console.log(
      "[NOTIFICATION][RECEIPT] EmailNotification to admin",
      emailNotification,
    );

    const emailAdminParams = emailNotification.getEmailParams();
    console.log("[NOTIFICATION][RECEIPT] Admin email ready to send ...");
    emailAdminParams.setAttachments([
      {
        content: csvContent,
        filename: `Cartago4x4_invoice_${order.display_id}.csv`,
        disposition: "attachment",
      },
    ]);
    console.log("[NOTIFICATION][RECEIPT] EmailNotification attachment ready");
    await this.mailerSendService.email
      .send(emailAdminParams)
      .then(() => "sent")
      .catch(() => "failed");

    console.log(
      `[NOTIFICATION][RECEIPT] Successfully sent ${order.display_id} email to ${adminEmail}`,
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
    attachmentGenerator: unknown,
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
        attachmentGenerator,
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
