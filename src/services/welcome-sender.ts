import { AbstractNotificationService, Customer } from "@medusajs/medusa";

import SendGridService from "medusa-plugin-sendgrid/services/sendgrid";
import { EntityManager } from "typeorm";

class WelcomeSenderService extends AbstractNotificationService {
  protected manager_: EntityManager;
  protected transactionManager_: EntityManager;
  private sendGridService: any;
  static identifier = "welcome-sender";

  constructor(container, options) {
    super(container);
    this.sendGridService = new SendGridService(container, {
      ...options,
      api_key: process.env.SENDGRID_API_KEY,
      from: process.env.SENDGRID_FROM,
    });
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

  createSendingOptions(notificationCustomer: Customer) {
    return {
      api_key: process.env.SENDGRID_API_KEY,
      templateId: process.env.SENDGRID_CUSTOMER_CREATED_ID,
      from: process.env.SENDGRID_FROM,
      to: notificationCustomer.email,
      personalizations: this.createCustomSendingOptions(
        notificationCustomer.email
      ),
      dynamic_template_data: {
        customer: notificationCustomer,
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
    data: Customer
  ): Promise<{
    to: string;
    status: string;
    data: Record<string, unknown>;
  }> {
    const notificationOptions = this.createSendingOptions(data);
    await this.sendGridService
      .sendEmail(notificationOptions)
      .then(() => "sent")
      .catch(() => "failed");

    const status = await this.sendGridService
      .sendEmail({
        ...notificationOptions,
        to: process.env.SENDGRID_TO_ADMIN,
        personalizations: this.createCustomSendingOptions(
          process.env.SENDGRID_TO_ADMIN
        ),
      })
      .then(() => "sent")
      .catch(() => "failed");

    return {
      to: data.email,
      status,
      data: notificationOptions,
    };
  }

  async resendNotification(
    notification: any,
    config: any
  ): Promise<{
    to: string;
    status: string;
    data: Record<string, unknown>;
  }> {
    console.log("[RESEND notification][Welcome Customer]: ", notification);
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

export default WelcomeSenderService;
