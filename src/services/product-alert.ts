import {
  TransactionBaseService,
  ProductVariantService,
  ProductService,
} from "@medusajs/medusa";
import { generateEntityId } from "@medusajs/utils";
import {
  ProductAlertSubscription,
  ProductAlertStatus,
} from "../models/product-alert-subscription";
import BrevoEcommerceService from "./brevo-ecommerce";
import * as nodemailer from "nodemailer";
import hbs from "nodemailer-express-handlebars";
import * as path from "path";

type ProductAlertSubscriptionRepository = typeof import("../repositories/product-alert-subscription").default;

interface SubscribeResult {
  success: boolean;
  message: string;
  subscription?: ProductAlertSubscription;
}

// Nodemailer Transporter Factory
class NodemailerTransporterFactory {
  static createTransporter(): nodemailer.Transporter {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true" || false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Configure Handlebars template engine
    const handlebarsOptions = {
      viewEngine: {
        partialsDir: path.join(__dirname, "../templates/partials/"),
        defaultLayout: false,
      },
      viewPath: path.join(__dirname, "../templates/emails/"),
      extName: ".handlebars",
    };

    transporter.use("compile", hbs(handlebarsOptions));

    return transporter;
  }
}

// Validation class
class ProductAlertValidator {
  private productVariantService: ProductVariantService;
  private productService: ProductService;

  constructor(productVariantService: ProductVariantService, productService: ProductService) {
    this.productVariantService = productVariantService;
    this.productService = productService;
  }

  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }



  async validateVariant(variantId: string): Promise<{ variant: any; product: any } | null> {
    try {
      const variant = await this.productVariantService.retrieve(variantId, {
        relations: ["product", "prices"],
      });
      const product = await this.productService.retrieve(variant.product_id, {
        relations: ["images", "variants", "variants.prices"],
      });
      return { variant, product };
    } catch (error) {
      return null;
    }
  }

  isOutOfStock(variant: any): boolean {
    return variant.inventory_quantity <= 0;
  }
}

// Notification class
class ProductAlertNotifier {
  private brevoEcommerceService: BrevoEcommerceService;
  private transporter: nodemailer.Transporter;

  constructor(brevoEcommerceService: BrevoEcommerceService) {
    this.brevoEcommerceService = brevoEcommerceService;
    this.transporter = NodemailerTransporterFactory.createTransporter();
  }

    private smtpBaseConfig(email: string, subject: string) {
    return {
       from: {address: process.env.SMTP_FROM || "equipo@cartago4x4.es",
        name: process.env.SMTP_SENDER || "Cartago4x4"},
        to: email,
        subject,
    };
  }

  async sendAdminNotification(
    email: string,
    variant: any,
    product: any,
    variantId: string,
    isNew: boolean
  ): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL || process.env.MAILERSEND_ADMIN_EMAIL;
    if (!adminEmail) return;

    try {
      const variantTitle = variant.title !== "Default Title"
        ? `${variant.title}`
        : product.title;
      const imageUrl = product.thumbnail || product.images?.[0]?.url;
      const productUrl = `${process.env.STORE_URL || "https://cartago4x4.es"}/products/${product.handle}?variant=${variantId}`;

      const subject = isNew ? `[Copia] Nueva suscripción: ${variantTitle}` : `[Copia] Suscripción: ${variantTitle}`;

      // Send email using Nodemailer with Handlebars template
      await this.transporter.sendMail({
       ...this.smtpBaseConfig(adminEmail, subject),
        template: "client-product-subscription-alert",
        context: {
          is_new: isNew,
          subscriber_email: email,
          image_url: imageUrl,
          variant_title: variantTitle,
          product_sku: variant.sku || "N/A",
          product_url: productUrl,
          current_year: new Date().getFullYear(),
        },
      });

      console.log(
        `[ProductAlertNotifier] Admin notification sent to ${adminEmail} for ${isNew ? 'new' : 'reactivated'} subscription`
      );
    } catch (error) {
      console.error(
        `[ProductAlertNotifier] Failed to send admin notification:`,
        error
      );
    }
  }

  async sendBackInStockNotifications(
    subscriptions: ProductAlertSubscription[],
    variant: any,
    product: any,
    variantId: string
  ): Promise<void> {
    const variantTitle = variant.title !== "Default Title"
      ? `${variant.title}`
      : product.title;
    const imageUrl = product.thumbnail || product.images?.[0]?.url;
    const productUrl = `${process.env.STORE_URL || "https://cartago4x4.es"}/products/${product.handle}?variant=${variantId}`;
    const price = variant.prices?.[0]?.amount
      ? (variant.prices[0].amount / 100).toFixed(2)
      : null;

    try {
      // Send emails to all subscribers
      const emailPromises = subscriptions.map((sub) => {
        const unsubscribeUrl = `${process.env.STORE_URL || "https://cartago4x4.es"}/account/alerts/unsubscribe?email=${encodeURIComponent(sub.email)}&variant=${variantId}`;

        return this.transporter.sendMail({
          ...this.smtpBaseConfig(sub.email, `¡${variantTitle} está de vuelta en stock!`),
          template: "back-in-stock-alert",
          context: {
            product_name: variantTitle,
            product_url: productUrl,
            product_image: imageUrl,
            product_price: price,
            variant_sku: variant.sku || "",
            unsubscribe_url: unsubscribeUrl,
            current_year: new Date().getFullYear(),
          },
        });
      });

      await Promise.all(emailPromises);

      console.log(
        `[ProductAlertNotifier] Sent back-in-stock notifications to ${subscriptions.length} subscribers for variant ${variantId}`
      );

      // Send admin notification
      await this.sendAdminBackInStockNotification(subscriptions, variant, product, variantId, variantTitle, imageUrl, productUrl);
    } catch (error) {
      console.error(
        `[ProductAlertNotifier] Failed to send back in stock notifications:`,
        error
      );
    }
  }

  private async sendAdminBackInStockNotification(
    subscriptions: ProductAlertSubscription[],
    variant: any,
    product: any,
    variantId: string,
    variantTitle: string,
    imageUrl: string,
    productUrl: string
  ): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL || process.env.MAILERSEND_ADMIN_EMAIL;
    if (!adminEmail) return;

    try {
      // Send email using Nodemailer with Handlebars template
      await this.transporter.sendMail({
        ...this.smtpBaseConfig(adminEmail, `[Copia] Aviso de disponibilidad: ${variantTitle}`),
        template: "back-in-stock-alert-admin",
        context: {
          subscribers_count: subscriptions.length,
          image_url: imageUrl,
          variant_title: variantTitle,
          product_url: productUrl,
          subscribers: subscriptions,
          current_year: new Date().getFullYear(),
        },
      });

      console.log(
        `[ProductAlertNotifier] Admin notification sent to ${adminEmail}`
      );
    } catch (error) {
      console.error(
        `[ProductAlertNotifier] Failed to send admin back in stock notification:`,
        error
      );
    }
  }
}

// Brevo Operations class
/* class BrevoOperations {
  private brevoEcommerceService: BrevoEcommerceService;

  constructor(brevoEcommerceService: BrevoEcommerceService) {
    this.brevoEcommerceService = brevoEcommerceService;
  }

  async ensureContact(email: string): Promise<{ success: boolean; data?: any; error?: any }> {
    return this.brevoEcommerceService.ensureContact(email);
  }

  async syncVariant(variant: any, product: any): Promise<{ success: boolean; error?: any }> {
    return this.brevoEcommerceService.syncVariant(variant, product);
  }

  async createProductAlert(email: string, variantId: string, contactId?: string): Promise<{ success: boolean; error?: any }> {
    return this.brevoEcommerceService.createProductAlert(email, variantId, contactId);
  }

  async createProductAlertForProduct(email: string, productId: string): Promise<{ success: boolean; error?: any }> {
    return this.brevoEcommerceService.createProductAlert(email, productId);
  }
} */

// Repository Management class
class ProductAlertRepositoryManager {
  private repository: ProductAlertSubscriptionRepository;

  constructor(repository: ProductAlertSubscriptionRepository) {
    this.repository = repository;
  }

  async findOne(where: any): Promise<ProductAlertSubscription | null> {
    return this.repository.findOne({ where });
  }

  async find(where: any, order?: any): Promise<ProductAlertSubscription[]> {
    return this.repository.find({ where, order });
  }

  async save(subscription: ProductAlertSubscription): Promise<ProductAlertSubscription> {
    return this.repository.save(subscription);
  }

  async count(where: any): Promise<number> {
    return this.repository.count({ where });
  }

  create(data: Partial<ProductAlertSubscription>): ProductAlertSubscription {
    return this.repository.create(data);
  }
}

class ProductAlertService extends TransactionBaseService {
  protected productAlertSubscriptionRepository_: ProductAlertSubscriptionRepository;
  protected productVariantService_: ProductVariantService;
  protected productService_: ProductService;
  protected brevoEcommerceService_: BrevoEcommerceService;

  private validator: ProductAlertValidator;
  private notifier: ProductAlertNotifier;
 // private brevoOps: BrevoOperations;
  private repoManager: ProductAlertRepositoryManager;

  constructor(container) {
    super(container);
    this.productAlertSubscriptionRepository_ =
      container.productAlertSubscriptionRepository;
    this.productVariantService_ = container.productVariantService;
    this.productService_ = container.productService;
    this.brevoEcommerceService_ = container.brevoEcommerceService;

    this.validator = new ProductAlertValidator(this.productVariantService_, this.productService_);
    this.notifier = new ProductAlertNotifier(this.brevoEcommerceService_);
   // this.brevoOps = new BrevoOperations(this.brevoEcommerceService_);
    this.repoManager = new ProductAlertRepositoryManager(this.productAlertSubscriptionRepository_);
  }

  /**
   * Subscribe an email to receive notifications when a variant is back in stock
   */
  async subscribe(email: string, variantId: string): Promise<SubscribeResult> {
    return this.atomicPhase_(async (manager) => {
      const repo = manager.withRepository(this.productAlertSubscriptionRepository_);
      this.repoManager = new ProductAlertRepositoryManager(repo);

      // Validate email
      if (!this.validator.validateEmail(email)) {
        return {
          success: false,
          message: "Formato de email inválido",
        };
      }

      // Validate variant
      const variantProduct = await this.validator.validateVariant(variantId);
      if (!variantProduct) {
        return {
          success: false,
          message: "Variante de producto no encontrada",
        };
      }
      const { variant, product } = variantProduct;

      // Check existing subscription
      const existingSubscription = await this.repoManager.findOne({
        email: email.toLowerCase(),
        variant_id: variantId,
      });

      if (existingSubscription?.status === ProductAlertStatus.PENDING) {
        return {
          success: true,
          message: "Ya estás suscrito a este producto",
          subscription: existingSubscription,
        };
      }

      // Check stock
      if (!this.validator.isOutOfStock(variant)) {
        return {
          success: false,
          message: "Este producto está disponible actualmente",
        };
      }

      // Reactivate if exists
      if (existingSubscription) {
        existingSubscription.status = ProductAlertStatus.PENDING;
        existingSubscription.notified_at = null;
        const reactivatedSubscription = await this.repoManager.save(existingSubscription);

        console.log(
          `[ProductAlertService] Reactivated subscription ${reactivatedSubscription.id} for ${email} on variant ${variantId}`
        );

        await this.notifier.sendAdminNotification(email, variant, product, variantId, false);

        return {
          success: true,
          message: "Suscripción reactivada. Te notificaremos cuando esté disponible.",
          subscription: reactivatedSubscription,
        };
      }

      // Brevo operations
    /*   const contactResult = await this.brevoOps.ensureContact(email.toLowerCase());
      const contactId = contactResult?.data?.contactId;
      if (!contactResult.success) {
        console.error(
          `[ProductAlertService] Failed to ensure contact in Brevo:`,
          contactResult.error
        );
      }

      const syncResult = await this.brevoOps.syncVariant(variant, product);
      if (!syncResult.success) {
        console.error(
          `[ProductAlertService] Failed to sync variant to Brevo:`,
          syncResult.error
        );
      }

      const alertResult = await this.brevoOps.createProductAlert(email.toLowerCase(), variantId, contactId);
      if (!alertResult.success) {
        console.error(
          `[ProductAlertService] Failed to create product alert in Brevo:`,
          alertResult.error
        );

        if (alertResult.error && String(alertResult.error).includes("403")) {
          try {
            console.log(
              `[ProductAlertService] Retrying product alert creation using parent product id ${product.id}`
            );
            const retry = await this.brevoOps.createProductAlertForProduct(email.toLowerCase(), product.id);
            if (!retry.success) {
              console.error(
                `[ProductAlertService] Retry failed for parent product ${product.id}:`,
                retry.error
              );
            } else {
              console.log(
                `[ProductAlertService] Product alert created for parent product ${product.id}`
              );
            }
          } catch (err) {
            console.error(
              `[ProductAlertService] Error retrying product alert for parent product ${product.id}:`,
              err
            );
          }
        }
      } */

      // Create subscription
      const subscription = this.repoManager.create({
        id: generateEntityId("", "pas"),
        email: email.toLowerCase(),
        variant_id: variantId,
        status: ProductAlertStatus.PENDING,
        notified_at: null,
      });

      const savedSubscription = await this.repoManager.save(subscription);

      console.log(
        `[ProductAlertService] Created subscription ${savedSubscription.id} for ${email} on variant ${variantId}`
      );

      await this.notifier.sendAdminNotification(email, variant, product, variantId, true);

      return {
        success: true,
        message: "Suscripción creada. Te notificaremos cuando esté disponible.",
        subscription: savedSubscription,
      };
    });
  }

  /**
   * Unsubscribe an email from a variant notification
   */
  async unsubscribe(
    email: string,
    variantId: string
  ): Promise<{ success: boolean; message: string }> {
    return this.atomicPhase_(async (manager) => {
      const repo = manager.withRepository(this.productAlertSubscriptionRepository_);
      this.repoManager = new ProductAlertRepositoryManager(repo);

      const subscription = await this.repoManager.findOne({
        email: email.toLowerCase(),
        variant_id: variantId,
        status: ProductAlertStatus.PENDING,
      });

      if (!subscription) {
        return {
          success: false,
          message: "No se encontró una suscripción activa",
        };
      }

      subscription.status = ProductAlertStatus.CANCELLED;
      await this.repoManager.save(subscription);

      console.log(
        `[ProductAlertService] Cancelled subscription ${subscription.id}`
      );

      return {
        success: true,
        message: "Suscripción cancelada correctamente",
      };
    });
  }

  /**
   * Process back in stock notification for a variant
   */
  async processBackInStock(variantId: string): Promise<void> {
    return this.atomicPhase_(async (manager) => {
      const repo = manager.withRepository(this.productAlertSubscriptionRepository_);
      this.repoManager = new ProductAlertRepositoryManager(repo);

      const pendingSubscriptions = await this.repoManager.find({
        variant_id: variantId,
        status: ProductAlertStatus.PENDING,
      });

      if (pendingSubscriptions.length === 0) {
        console.log(
          `[ProductAlertService] No pending subscriptions for variant ${variantId}`
        );
        return;
      }

      console.log(
        `[ProductAlertService] Processing ${pendingSubscriptions.length} subscriptions for variant ${variantId}`
      );

      const variantProduct = await this.validator.validateVariant(variantId);
      if (!variantProduct) {
        console.error(
          `[ProductAlertService] Failed to retrieve variant ${variantId}`
        );
        return;
      }
      const { variant, product } = variantProduct;

     // await this.brevoOps.syncVariant(variant, product);

      await this.notifier.sendBackInStockNotifications(pendingSubscriptions, variant, product, variantId);

      // Mark as notified
      const now = new Date();
      for (const subscription of pendingSubscriptions) {
        subscription.status = ProductAlertStatus.NOTIFIED;
        subscription.notified_at = now;
        await this.repoManager.save(subscription);
      }

      console.log(
        `[ProductAlertService] Marked ${pendingSubscriptions.length} subscriptions as notified`
      );

      console.log(
        `[ProductAlertService] Completed processing back in stock for variant ${variantId}`
      );
    });
  }

  /**
   * Get all subscriptions for an email
   */
  async listByEmail(email: string): Promise<ProductAlertSubscription[]> {
    const repo = this.activeManager_.withRepository(
      this.productAlertSubscriptionRepository_
    );
    this.repoManager = new ProductAlertRepositoryManager(repo);

    return this.repoManager.find(
      { email: email.toLowerCase() },
      { created_at: "DESC" }
    );
  }

  /**
   * Get pending subscriptions count for a variant
   */
  async getPendingCount(variantId: string): Promise<number> {
    const repo = this.activeManager_.withRepository(
      this.productAlertSubscriptionRepository_
    );
    this.repoManager = new ProductAlertRepositoryManager(repo);

    return this.repoManager.count({
      variant_id: variantId,
      status: ProductAlertStatus.PENDING,
    });
  }
}

export default ProductAlertService;
