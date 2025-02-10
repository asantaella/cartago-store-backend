import { AbstractNotificationService, Customer } from "@medusajs/medusa";

import SendGridService from "medusa-plugin-sendgrid/services/sendgrid";
import { EntityManager } from "typeorm";

type CustomerRequestPassword = Partial<Customer> & { token: string };

class ResetPasswordService extends AbstractNotificationService {
  protected manager_: EntityManager;
  protected transactionManager_: EntityManager;
  private sendGridService: any;
  static identifier = "reset-password";

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

  createSendingOptions(customerReqPass: CustomerRequestPassword) {
    return {
      api_key: process.env.SENDGRID_API_KEY,
      templateId: process.env.SENDGRID_RESET_PASSWORD,
      from: process.env.SENDGRID_FROM,
      to: customerReqPass.email,
      personalizations: this.createCustomSendingOptions(customerReqPass.email),
      dynamic_template_data: {
        id: customerReqPass.id,
        first_name: customerReqPass.first_name,
        last_name: customerReqPass.last_name,
        email: customerReqPass.email,
        token: customerReqPass.token,
        Sender_Name: process.env.SENDGRID_SENDER_NAME,
        Sender_Address: process.env.SENDGRID_SENDER_ADDRESS,
      },
    };
  }

  async sendNotification(
    event: string,
    data: CustomerRequestPassword
  ): Promise<{
    to: string;
    status: string;
    data: CustomerRequestPassword;
  }> {
    console.log("[NOTIFICATION] Reset password data =>", data);
    const notificationOptions = this.createSendingOptions(data);
    console.log("[NOTIFICATION] Template options =>", notificationOptions);
    const status = await this.sendGridService
      .sendEmail(notificationOptions)
      .then(() => "sent")
      .catch(() => "failed");
    console.log("[NOTIFICATION] Reset password email send =>", data);
    return {
      to: data.email,
      status,
      data,
    };
  }

  async resendNotification(
    notification: any,
    config: any
  ): Promise<{
    to: string;
    status: string;
    data: CustomerRequestPassword;
  }> {
    const to: string = config.to ? config.to : notification.to;

    return {
      to,
      status: "done",
      data: notification.data, // make changes to the data
    };
  }
}

export default ResetPasswordService;
