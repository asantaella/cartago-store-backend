import { ProductAlertSubscription } from "../models/product-alert-subscription";
import AbstractBrevoEmailNotification from "./abstract-brevo-email-notification";
import EmailTemplateCompiler from "./email-template-compiler";

class ProductAlertStockEmailNotification extends AbstractBrevoEmailNotification {
  async sendEmailCustomer(
    subscription: ProductAlertSubscription,
    variant: any,
    product: any,
    variantId: string,
  ): Promise<void> {
    const variantTitle =
      variant.title !== "Default Title" ? `${variant.title}` : product.title;
    const imageUrl = product.thumbnail || product.images?.[0]?.url;
    const productUrl = `${process.env.STORE_URL || "https://cartago4x4.es"}/products/${product.handle}?variant=${variantId}`;
    const price = variant.prices?.[0]?.amount
      ? (variant.prices[0].amount / 100).toFixed(2)
      : null;
    const unsubscribeUrl = `${process.env.STORE_URL || "https://cartago4x4.es"}/account/alerts/unsubscribe?email=${encodeURIComponent(subscription.email)}&variant=${variantId}`;

    const html = EmailTemplateCompiler.renderTemplate("back-in-stock-alert", {
      subscriber_name: subscription.email,
      product_name: variantTitle,
      product_url: productUrl,
      product_image: imageUrl,
      product_price: price,
      variant_sku: variant.sku || "",
      unsubscribe_url: unsubscribeUrl,
      current_year: new Date().getFullYear(),
    });

    if (!html) {
      throw new Error(
        `Failed to render back-in-stock template for ${subscription.email}`,
      );
    }

    const payload = this.buildEmailPayload(
      subscription.email,
      `¡${variantTitle} está de vuelta en stock!`,
      html,
      ["product-alert", "back-in-stock"],
    );

    await this.sendEmailWithRetry(
      payload,
      `Back-in-stock alert for ${subscription.email}`,
    );
  }

  async sendEmailAdmin(
    subscriptions: ProductAlertSubscription[],
    variant: any,
    product: any,
    variantId: string,
  ): Promise<void> {
    const adminEmail =
      process.env.ADMIN_EMAIL || process.env.MAILERSEND_ADMIN_EMAIL;

    if (!adminEmail) {
      return;
    }

    const variantTitle =
      variant.title !== "Default Title" ? `${variant.title}` : product.title;
    const imageUrl = product.thumbnail || product.images?.[0]?.url;
    const productUrl = `${process.env.STORE_URL || "https://cartago4x4.es"}/products/${product.handle}?variant=${variantId}`;

    const html = EmailTemplateCompiler.renderTemplate(
      "back-in-stock-alert-admin",
      {
        subscribers_count: subscriptions.length,
        image_url: imageUrl,
        variant_title: variantTitle,
        product_url: productUrl,
        subscribers: subscriptions,
        current_year: new Date().getFullYear(),
      },
    );

    if (!html) {
      throw new Error("Failed to render admin back-in-stock template");
    }

    const payload = this.buildEmailPayload(
      adminEmail,
      `[Copia] Aviso de disponibilidad: ${variantTitle}`,
      html,
      ["product-alert", "admin-notification", "back-in-stock"],
    );

    await this.sendEmailWithRetry(
      payload,
      `Admin back-in-stock notification for variant ${variantId}`,
    );
  }

  sendSubscriptionAdminNotification(
    email: string,
    variant: any,
    product: any,
    variantId: string,
    isNew: boolean,
  ): void {
    const adminEmail =
      process.env.ADMIN_EMAIL || process.env.MAILERSEND_ADMIN_EMAIL;

    if (!adminEmail) {
      return;
    }

    setImmediate(async () => {
      try {
        const variantTitle =
          variant.title !== "Default Title"
            ? `${variant.title}`
            : product.title;
        const imageUrl = product.thumbnail || product.images?.[0]?.url;
        const productUrl = `${process.env.STORE_URL || "https://cartago4x4.es"}/products/${product.handle}?variant=${variantId}`;

        const html = EmailTemplateCompiler.renderTemplate(
          "client-product-subscription-alert",
          {
            is_new: isNew,
            subscriber_email: email,
            image_url: imageUrl,
            variant_title: variantTitle,
            product_sku: variant.sku || "N/A",
            product_url: productUrl,
            current_year: new Date().getFullYear(),
          },
        );

        if (!html) {
          throw new Error("Failed to render admin subscription template");
        }

        const subject = isNew
          ? `[Copia] Nueva suscripción: ${variantTitle}`
          : `[Copia] Suscripción reactivada: ${variantTitle}`;

        const payload = this.buildEmailPayload(adminEmail, subject, html, [
          "product-alert",
          "admin-notification",
        ]);

        await this.sendEmailWithRetry(
          payload,
          `Admin notification for ${email}`,
        );
      } catch (error) {
        console.error(
          "[ProductAlertStockEmailNotification] Failed to send admin subscription notification:",
          error,
        );
      }
    });
  }

  async sendBackInStockNotifications(
    subscriptions: ProductAlertSubscription[],
    variant: any,
    product: any,
    variantId: string,
  ): Promise<void> {
    const results = await Promise.allSettled(
      subscriptions.map((subscription) =>
        this.sendEmailCustomer(subscription, variant, product, variantId),
      ),
    );

    const failures = results.filter(
      (result) => result.status === "rejected",
    ).length;

    if (failures > 0) {
      console.error(
        `[ProductAlertStockEmailNotification] ${failures} back-in-stock notifications failed for variant ${variantId}`,
      );
    }

    await this.sendEmailAdmin(subscriptions, variant, product, variantId);
  }
}

export default ProductAlertStockEmailNotification;
