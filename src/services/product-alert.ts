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

import * as nodemailer from "nodemailer";
import * as path from "path";

type ProductAlertSubscriptionRepository = typeof import("../repositories/product-alert-subscription").default;

interface SubscribeResult {
  success: boolean;
  message: string;
  subscription?: ProductAlertSubscription;
}

// Nodemailer Transporter Factory with lazy loading and safe initialization
class NodemailerTransporterFactory {
  private static instance: nodemailer.Transporter | null = null;
  private static initializationError: Error | null = null;

  static validateSmtpConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!process.env.SMTP_USER) {
      errors.push("SMTP_USER environment variable is not configured");
    }
    if (!process.env.SMTP_PASS) {
      errors.push("SMTP_PASS environment variable is not configured");
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private static configureHandlebars(transporter: nodemailer.Transporter): boolean {
    try {
      const handlebarsOptions = {
        viewEngine: {
          partialsDir: path.join(__dirname, "../templates/partials/"),
          defaultLayout: false,
        },
        viewPath: path.join(__dirname, "../templates/emails/"),
        extName: ".handlebars",
      };

      // Dynamic require to prevent startup crashes
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const hbsModule = require("nodemailer-express-handlebars");
      const hbs = hbsModule.default || hbsModule;
      
      transporter.use("compile", hbs(handlebarsOptions));
      return true;
    } catch (error) {
      console.error(
        "[ProductAlertService] Failed to configure Handlebars templates. Email templates will not be available:",
        error instanceof Error ? error.message : error
      );
      return false;
    }
  }

  static createTransporter(): nodemailer.Transporter {
    const validation = this.validateSmtpConfig();
    if (!validation.valid) {
      const errorMsg = `SMTP configuration invalid: ${validation.errors.join(", ")}`;
      console.warn(`[ProductAlertService] ${errorMsg}. Email functionality will be disabled.`);
    }

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure: process.env.SMTP_SECURE === "true" || false,
        auth: {
          user: process.env.SMTP_USER || "",
          pass: process.env.SMTP_PASS || "",
        },
      });

      // Try to configure Handlebars, but don't fail if it's not available
      const handlebarsConfigured = this.configureHandlebars(transporter);
      
      if (!handlebarsConfigured) {
        console.warn(
          "[ProductAlertService] Transporter created without Handlebars template support. " +
          "Emails will need to be sent with plain HTML instead."
        );
      }
      
      return transporter;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        "[ProductAlertService] Failed to create SMTP transporter:",
        errorMessage
      );
      this.initializationError = error instanceof Error ? error : new Error(errorMessage);
      
      // Return a dummy transporter that won't crash but will log errors on use
      console.warn(
        "[ProductAlertService] Creating fallback transporter. Email functionality may not work."
      );
      
      const dummyTransporter = nodemailer.createTransport({
        streamTransport: true,
        newline: "unix",
      });
      
      return dummyTransporter;
    }
  }

  static getInstance(): nodemailer.Transporter {
    if (!this.instance) {
      this.instance = this.createTransporter();
    }
    
    if (this.initializationError) {
      console.warn(
        "[ProductAlertService] Transporter was not properly initialized. Email sending may fail."
      );
    }
    
    return this.instance;
  }

  static resetInstance(): void {
    this.instance = null;
    this.initializationError = null;
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
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = NodemailerTransporterFactory.getInstance();
    }
    return this.transporter;
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

      await this.getTransporter().sendMail({
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
        return this.getTransporter().sendMail({
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
      await this.getTransporter().sendMail({
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

  private validator: ProductAlertValidator;
  private notifier: ProductAlertNotifier;
  private repoManager: ProductAlertRepositoryManager;

  constructor(container) {
    super(container);
    this.productAlertSubscriptionRepository_ =
      container.productAlertSubscriptionRepository;
    this.productVariantService_ = container.productVariantService;
    this.productService_ = container.productService;
    this.validator = new ProductAlertValidator(this.productVariantService_, this.productService_);
    // Initialize notifier to ensure email notifications can be sent
    this.notifier = new ProductAlertNotifier();
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
