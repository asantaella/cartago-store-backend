type BrevoRecipient = {
  email: string;
  name?: string;
};

type BrevoAttachment = {
  content: string;
  name: string;
};

export type BrevoEmailPayload = {
  sender: {
    name: string;
    email: string;
  };
  to: BrevoRecipient[];
  subject: string;
  htmlContent: string;
  tags?: string[];
  attachment?: BrevoAttachment[];
};

class BrevoApiClient {
  private static instance: BrevoApiClient | null = null;

  private apiKey: string | null = null;

  private readonly apiUrl = "https://api.brevo.com/v3/smtp/email";

  private initializationError: Error | null = null;

  private constructor() {
    this.validateConfig();
  }

  static validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!process.env.BREVO_API_KEY) {
      errors.push("BREVO_API_KEY environment variable is not configured");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private validateConfig(): void {
    const validation = BrevoApiClient.validateConfig();

    if (!validation.valid) {
      const errorMsg = `Brevo API configuration invalid: ${validation.errors.join(
        ", ",
      )}`;

      this.initializationError = new Error(errorMsg);
      console.warn(`[BrevoApiClient] ${errorMsg}`);
      return;
    }

    this.apiKey = process.env.BREVO_API_KEY || null;
  }

  static getInstance(): BrevoApiClient {
    if (!this.instance) {
      this.instance = new BrevoApiClient();
    }

    return this.instance;
  }

  async sendEmail(payload: BrevoEmailPayload): Promise<{ messageId: string }> {
    if (this.initializationError) {
      throw new Error(
        `Brevo API client not properly initialized: ${this.initializationError.message}`,
      );
    }

    if (!this.apiKey) {
      throw new Error("BREVO_API_KEY is not configured");
    }

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": this.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brevo API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();

    return { messageId: result.messageId };
  }
}

abstract class AbstractBrevoEmailNotification {
  private static readonly MAX_RETRIES = 3;

  private static readonly RETRY_DELAY = 2000;

  private client: BrevoApiClient | null = null;

  protected getClient(): BrevoApiClient {
    if (!this.client) {
      this.client = BrevoApiClient.getInstance();
    }

    return this.client;
  }

  protected buildEmailPayload(
    email: string,
    subject: string,
    htmlContent: string,
    tags?: string[],
    name?: string,
    attachment?: BrevoAttachment[],
  ): BrevoEmailPayload {
    return {
      sender: {
        email: process.env.SMTP_FROM || "equipo@cartago4x4.es",
        name: process.env.SMTP_SENDER || "Cartago4x4",
      },
      to: [{ email, name }],
      subject,
      htmlContent,
      tags,
      attachment,
    };
  }

  protected async sendEmailWithRetry(
    payload: BrevoEmailPayload,
    context: string,
  ): Promise<{ messageId: string }> {
    let lastError: Error | null = null;
    const client = this.getClient();

    for (
      let attempt = 1;
      attempt <= AbstractBrevoEmailNotification.MAX_RETRIES;
      attempt += 1
    ) {
      try {
        console.log(
          `[${this.constructor.name}] ${context} - Attempt ${attempt}/${AbstractBrevoEmailNotification.MAX_RETRIES}`,
        );

        const result = await client.sendEmail(payload);

        console.log(
          `[${this.constructor.name}] ${context} - Email sent successfully. MessageId: ${result.messageId}`,
        );

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        console.error(
          `[${this.constructor.name}] ${context} - Attempt ${attempt} failed:`,
          lastError.message,
        );

        if (
          lastError.message.includes("401") ||
          lastError.message.includes("403") ||
          lastError.message.includes("invalid") ||
          lastError.message.includes("unauthorized")
        ) {
          throw lastError;
        }

        if (attempt < AbstractBrevoEmailNotification.MAX_RETRIES) {
          const delay = AbstractBrevoEmailNotification.RETRY_DELAY * attempt;

          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error("Failed to send email after retries");
  }

  abstract sendEmailCustomer(...args: any[]): Promise<void>;

  abstract sendEmailAdmin(...args: any[]): Promise<void>;
}

export default AbstractBrevoEmailNotification;
