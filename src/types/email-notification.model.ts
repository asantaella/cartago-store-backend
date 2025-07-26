import { EmailParams, Recipient, Sender } from "mailersend";

interface EmailNotificationParams {
  toEmail: string;
  toName: string;
  templateId: string;
  templateData?: Record<string, any>;
}

export class EmailNotification {
  private toEmail: string;
  private senderEmail: string;
  private senderName: string;
  private toName: string;
  private templateId: string;
  private templateData: Record<string, any>;

  constructor({
    toEmail,
    toName,
    templateId,
    templateData,
  }: EmailNotificationParams) {
    this.toEmail = toEmail;
    this.toName = toName;
    this.templateId = templateId;
    this.senderEmail =
      process.env.MAILERSEND_SENDER_EMAIL || "equipo@cartago4x4.es";
    this.senderName = process.env.MAILERSEND_SENDER_NAME || "Cartago4x4";
    this.templateData = templateData;
  }

  private get sender(): Sender {
    return {
      email: this.senderEmail || "equipo@cartago4x4.es",
      name: this.senderName || "Cartago4x4",
    };
  }

  public setToEmail(email: string) {
    this.toEmail = email;
  }

  public setTemplateData(data: Record<string, any>) {
    this.templateData = {
      ...data,
    };
  }

  public getEmailParams(): EmailParams {
    const recipients = [new Recipient(this.toEmail, this.toName)];
    return new EmailParams()
      .setFrom(this.sender)
      .setTo(recipients)
      .setTemplateId(this.templateId)
      .setPersonalization([
        {
          email: this.toEmail,
          data: this.templateData,
        },
      ]);
  }

  toString(): string {
    return `EmailNotification(toEmail=${this.toEmail}, toName=${this.toName}, templateId=${this.templateId})`;
  }
}
