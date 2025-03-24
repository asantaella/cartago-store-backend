import { AbstractNotificationService, Customer } from "@medusajs/medusa";
import { EntityManager } from "typeorm";
import { MailerSend, EmailParams, Recipient } from "mailersend";

// Define a type for our email data structure
type MailerSendData = {
  to_email: string;
  to_name?: string;
  from_email: string;
  from_name?: string;
  template_id?: string;
  data: Record<string, any>;
};

type CustomerRequestPassword = Partial<Customer> & { token: string };

class ResetPasswordService extends AbstractNotificationService {
  protected manager_: EntityManager;
  protected transactionManager_: EntityManager;
  static identifier = "reset-password";
  static is_installed = true;
  protected config: any;
  private mailerSendService: MailerSend;

  constructor(container, options) {
    super(container);

    // Inicializar la configuración
    this.config = {
      reset_password_url: process.env.MAILERSEND_RESET_PASSWORD_URL,
      support_url: process.env.MAILERSEND_SUPPORT_URL,
      account_name: process.env.MAILERSEND_SENDER_NAME,
      company_name: process.env.MAILERSEND_COMPANY_NAME,
      sender_name: process.env.MAILERSEND_SENDER_NAME,
      sender_email: process.env.MAILERSEND_SENDER_EMAIL,
      sender_address: process.env.MAILERSEND_SENDER_ADDRESS,
      template_overrides: {
        "customer.reset_password":
          process.env.MAILERSEND_RESET_PASSWORD_TEMPLATE_ID,
      },
    };

    console.log(
      "[NOTIFICATION] Reset password service initialized:\n",
      this.config
    );

    try {
      this.mailerSendService = new MailerSend({
        apiKey: process.env.MAILERSEND_API_KEY,
      });
      console.log("[NOTIFICATION] MailerSend client initialized successfully");
    } catch (error) {
      console.error(
        "[NOTIFICATION] Error initializing MailerSend client:",
        error
      );
    }
  }

  private getTemplateData(data: CustomerRequestPassword): MailerSendData {
    if (!data || typeof data !== "object") {
      return {
        to_email: "",
        from_email: "",
        data: {},
      };
    }

    const templateId = (this.config as any)?.template_overrides?.[
      "customer.reset_password"
    ];

    const customerData = data as CustomerRequestPassword;
    const resetPassUrl = `${this.config.reset_password_url}?email=${customerData.email}&token=${customerData.token}`;
    return {
      to_email: customerData.email,
      from_email: this.config.sender_email,
      to_name: `${customerData.first_name} ${customerData.last_name}`,
      from_name: this.config.sender_name,
      template_id: templateId,
      data: {
        account_name: this.config.account_name,
        company_name: this.config.company_name,
        sender_address: this.config.sender_address,
        support_url: this.config.support_url,
        name: customerData.first_name,
        action_url: resetPassUrl,
        token: customerData.token,
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
    const {
      to_email,
      to_name,
      template_id,
      data: templateData,
    } = this.getTemplateData(data);
    try {
      // Intentar usar el servicio MailerSend
      if (this.mailerSendService) {
        const recipients = [new Recipient(to_email, to_name)];

        // Crear parámetros de email
        const emailParams = new EmailParams()
          .setFrom({
            email: this.config.from_email || "equipo@cartago4x4.es",
            name: this.config.from_name || "Cartago 4x4",
          })
          .setTo(recipients);

        if (!template_id) throw new Error("Template ID not found");

        emailParams.setTemplateId(template_id);
        emailParams.setPersonalization([
          {
            email: to_email,
            data: templateData,
          },
        ]);
        console.log(
          "[NOTIFICATION] Reset password email sent successfully to",
          emailParams,
          emailParams.personalization[0].data
        );

        await this.mailerSendService.email.send(emailParams);
        console.log(
          "[NOTIFICATION] Reset password email sent successfully to",
          data.email
        );
      } else {
        console.log(
          "[NOTIFICATION] MailerSend client not available, email not sent"
        );
      }

      return {
        to: data.email,
        status: "sent",
        data,
      };
    } catch (error) {
      console.error(
        "[NOTIFICATION] Error sending reset password email:",
        error
      );

      // En un entorno productivo, podríamos enviar un email de respaldo o informar del error
      return {
        to: data.email,
        status: "failed",
        data,
      };
    }
  }

  async resendNotification(
    notification: any,
    config: any
  ): Promise<{
    to: string;
    status: string;
    data: CustomerRequestPassword;
  }> {
    const to: string = config.to_email ? config.to_email : notification.to;

    if (config.to_email && config.to_email !== notification.to) {
      // Si hay un nuevo destinatario, reenvía la notificación
      const updatedData = {
        ...notification.data,
        email: config.to,
      };

      return this.sendNotification("customer.password_reset", updatedData);
    }

    return {
      to,
      status: "done",
      data: notification.data,
    };
  }
}

export default ResetPasswordService;
