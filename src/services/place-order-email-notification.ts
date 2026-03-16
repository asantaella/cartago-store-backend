import { Order } from "@medusajs/medusa";
import AbstractBrevoEmailNotification from "./abstract-brevo-email-notification";
import EmailTemplateCompiler from "./email-template-compiler";
import OrderNotificationService, {
  MailerSendOrderData,
} from "./order-notification";

type PaymentLike = {
  provider_id?: string;
  data?: Record<string, unknown> | null;
};

type RecordLike = Record<string, unknown>;

class PlaceOrderEmailNotificationService extends AbstractBrevoEmailNotification {
  protected orderNotificationService: OrderNotificationService;

  constructor(container) {
    super();
    this.orderNotificationService = new OrderNotificationService(container);
  }

  private normalizePaymentMethodTypes(data: unknown): string[] {
    if (!data || typeof data !== "object") {
      return [];
    }

    const record = data as Record<string, unknown>;
    const directTypes = record.payment_method_types;

    if (Array.isArray(directTypes)) {
      return directTypes.filter(
        (value): value is string => typeof value === "string",
      );
    }

    const nestedCandidates = [
      record.payment_intent,
      record.paymentIntent,
      record.data,
    ];

    for (const candidate of nestedCandidates) {
      const nestedTypes = this.normalizePaymentMethodTypes(candidate);

      if (nestedTypes.length > 0) {
        return nestedTypes;
      }
    }

    return [];
  }

  private isRecord(value: unknown): value is RecordLike {
    return !!value && typeof value === "object";
  }


  private extractPaymentIntentStatus(data: unknown): string | undefined {
    if (!this.isRecord(data)) {
      return undefined;
    }

    const directStatusCandidates = [
      data.status,
      this.isRecord(data.payment_intent)
        ? data.payment_intent.status
        : undefined,
      this.isRecord(data.paymentIntent) ? data.paymentIntent.status : undefined,
    ];

    for (const candidate of directStatusCandidates) {
      if (typeof candidate === "string" && candidate.length > 0) {
        return candidate;
      }
    }

    const nestedCandidates = [
      data.payment_intent,
      data.paymentIntent,
      data.data,
    ];

    for (const candidate of nestedCandidates) {
      const nestedStatus = this.extractPaymentIntentStatus(candidate);
      if (nestedStatus) {     
        return nestedStatus;
      }
    }

    return undefined;
  }



  isSepaDirectDebitOrderProcessing(order: Order): boolean {
    const payments = (
      (order as unknown as { payments?: PaymentLike[] }).payments || []
    ).filter(Boolean);

    return payments.some((payment) => {
      const providerId = payment.provider_id;
      const isStripeProvider = !providerId || providerId === "stripe";
  
      return (
        isStripeProvider && this.extractPaymentIntentStatus(payment.data) === "processing"
      );
    });
  }

  private buildTemplateData(order: Order): {
    toEmail: string;
    toName: string;
    templateData: MailerSendOrderData;
  } {
    const { to_email, to_name, data } =
      this.orderNotificationService.getTemplateData(order);

    if (!to_email || !data) {
      throw new Error(
        "Recipient email is required for order placed SEPA notification",
      );
    }

    return {
      toEmail: to_email,
      toName: to_name,
      templateData: {
        ...data,
        payment_method_label: "Transferencia bancaria SEPA",
        payment_note:
          "Tu pago se ha registrado mediante transferencia SEPA Debit Direct. El cargo puede tardar algunos días hábiles en reflejarse definitivamente según tu entidad bancaria.",
      },
    };
  }

  private renderOrderTemplate(templateData: MailerSendOrderData): string {
    const html = EmailTemplateCompiler.renderTemplate(
      "order-placed-SEPA-transfer",
      templateData,
    );

    if (!html) {
      throw new Error("Failed to render order-placed-SEPA-transfer template");
    }

    return html;
  }

  async sendEmailCustomer(order: Order): Promise<void> {
    const { toEmail, toName, templateData } = this.buildTemplateData(order);
    const html = this.renderOrderTemplate(templateData);
    const payload = this.buildEmailPayload(
      toEmail,
      `Hemos recibido tu pedido #${templateData.display_id}`,
      html,
      ["order-placed", "sepa-direct-debit"],
      toName,
    );

    await this.sendEmailWithRetry(
      payload,
      `Order placed SEPA customer notification for order ${templateData.display_id}`,
    );
  }

  async sendEmailAdmin(order: Order): Promise<void> {
    const adminEmail =
      process.env.ADMIN_EMAIL || process.env.MAILERSEND_ADMIN_EMAIL;

    if (!adminEmail) {
      return;
    }

    const { templateData } = this.buildTemplateData(order);
    const html = this.renderOrderTemplate(templateData);
    const payload = this.buildEmailPayload(
      adminEmail,
      `[Copia] Pedido SEPA recibido #${templateData.display_id}`,
      html,
      ["order-placed", "admin-notification", "sepa-direct-debit"],
    );

    await this.sendEmailWithRetry(
      payload,
      `Order placed SEPA admin notification for order ${templateData.display_id}`,
    );
  }

  async sendNotification(
    event: string,
    data: Order,
  ): Promise<{
    to: string;
    status: string;
    data: Record<string, unknown>;
  }> {
    try {
      const order =
        await this.orderNotificationService.retrieveOrderWithRelations(
          data.id,
          ["payments", "customer", "gift_cards", "items.tax_lines"],
        );

      if (!this.isSepaDirectDebitOrderProcessing(order)) {
        console.log(
          `[NOTIFICATION][ORDER_PLACED_SEPA] Skipping ${event} for order ${order.display_id}: payment is not Stripe SEPA Direct Debit in processing status`,
        );

        return {
          to: order.email,
          status: "skipped",
          data: order as unknown as Record<string, unknown>,
        };
      }

      await this.sendEmailCustomer(order);
      await this.sendEmailAdmin(order);

      return {
        to: order.email,
        status: "sent",
        data: order as unknown as Record<string, unknown>,
      };
    } catch (error) {
      console.error(
        `[NOTIFICATION][ORDER_PLACED_SEPA] Error sending ${event} email:`,
        error,
      );

      return {
        to: data.email,
        status: "failed",
        data: data as unknown as Record<string, unknown>,
      };
    }
  }
}

export default PlaceOrderEmailNotificationService;
