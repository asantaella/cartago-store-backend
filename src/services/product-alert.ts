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
import * as fs from "fs";
import * as Handlebars from "handlebars";

type ProductAlertSubscriptionRepository = typeof import("../repositories/product-alert-subscription").default;

interface SubscribeResult {
  success: boolean;
  message: string;
  subscription?: ProductAlertSubscription;
}

// Email Template Compiler
class EmailTemplateCompiler {
  private static templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();
  private static partialsRegistered = false;

  static registerPartials(): void {
    if (this.partialsRegistered) return;

    try {
      const partialsDir = path.join(__dirname, "../templates/partials/");
      if (fs.existsSync(partialsDir)) {
        const partialFiles = fs.readdirSync(partialsDir).filter(f => f.endsWith('.handlebars'));
        
        partialFiles.forEach(file => {
          const partialName = file.replace('.handlebars', '');
          const partialPath = path.join(partialsDir, file);
          const partialContent = fs.readFileSync(partialPath, 'utf8');
          Handlebars.registerPartial(partialName, partialContent);
        });
        
        console.log(`[EmailTemplateCompiler] Registered ${partialFiles.length} Handlebars partials`);
      }
      this.partialsRegistered = true;
    } catch (error) {
      console.error('[EmailTemplateCompiler] Failed to register partials:', error);
    }
  }

  static compileTemplate(templateName: string): HandlebarsTemplateDelegate | null {
    try {
      // Check cache first
      if (this.templateCache.has(templateName)) {
        return this.templateCache.get(templateName)!;
      }

      // Register partials if not already done
      this.registerPartials();

      // Load and compile template
      const templatePath = path.join(__dirname, "../templates/emails/", `${templateName}.handlebars`);
      
      if (!fs.existsSync(templatePath)) {
        console.error(`[EmailTemplateCompiler] Template not found: ${templatePath}`);
        return null;
      }

      const templateSource = fs.readFileSync(templatePath, 'utf8');
      const template = Handlebars.compile(templateSource);
      
      // Cache the compiled template
      this.templateCache.set(templateName, template);
      
      return template;
    } catch (error) {
      console.error(`[EmailTemplateCompiler] Failed to compile template ${templateName}:`, error);
      return null;
    }
  }

  static renderTemplate(templateName: string, context: any): string | null {
    const template = this.compileTemplate(templateName);
    if (!template) return null;

    try {
      return template(context);
    } catch (error) {
      console.error(`[EmailTemplateCompiler] Failed to render template ${templateName}:`, error);
      return null;
    }
  }
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

  // Removed - no longer needed with direct Handlebars compilation

  static createTransporter(): nodemailer.Transporter {
    const validation = this.validateSmtpConfig();
    if (!validation.valid) {
      const errorMsg = `SMTP configuration invalid: ${validation.errors.join(", ")}`;
      console.warn(`[ProductAlertService] ${errorMsg}. Email functionality will be disabled.`);
    }

    try {
      const port = parseInt(process.env.SMTP_PORT || "587", 10);
      const secure = process.env.SMTP_SECURE === "true" || port === 465;
      const host = process.env.SMTP_HOST || "smtp-relay.brevo.com";

      console.log(`[ProductAlertService] Creating SMTP transporter with config:`, {
        host,
        port,
        secure,
        user: process.env.SMTP_USER ? `${process.env.SMTP_USER.substring(0, 4)}***` : 'not set',
      });

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure, // true for 465, false for other ports
        pool: true, // Use pooled connections
        maxConnections: 5,
        maxMessages: 10,
        rateDelta: 1000, // 1 message per second
        rateLimit: 5,
        connectionTimeout: 120000, // 120 seconds for production environments
        greetingTimeout: 30000,
        socketTimeout: 120000,
        auth: {
          user: process.env.SMTP_USER || "",
          pass: process.env.SMTP_PASS || "",
        },
        tls: {
          // Do not fail on invalid certs (for some providers)
          rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false",
          minVersion: 'TLSv1.2',
        },
        // Enable debug logging in production if needed
        logger: process.env.SMTP_DEBUG === "true",
        debug: process.env.SMTP_DEBUG === "true",
      });

      // Verify connection on initialization
      transporter.verify((error, success) => {
        if (error) {
          console.error("[ProductAlertService] SMTP connection verification failed:", error.message);
          console.error("[ProductAlertService] This may cause email sending failures. Please check SMTP configuration.");
        } else {
          console.log("[ProductAlertService] SMTP server is ready to send emails");
        }
      });

      console.log("[ProductAlertService] SMTP Transporter created successfully with direct Handlebars support");
      
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
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 2000; // 2 seconds

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = NodemailerTransporterFactory.getInstance();
    }
    return this.transporter;
  }

  private async sendMailWithRetry(
    transporter: nodemailer.Transporter,
    mailOptions: any,
    context: string
  ): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= ProductAlertNotifier.MAX_RETRIES; attempt++) {
      try {
        console.log(`[ProductAlertNotifier] ${context} - Attempt ${attempt}/${ProductAlertNotifier.MAX_RETRIES}`);
        await transporter.sendMail(mailOptions);
        console.log(`[ProductAlertNotifier] ${context} - Email sent successfully`);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(
          `[ProductAlertNotifier] ${context} - Attempt ${attempt} failed:`,
          lastError.message
        );
        
        // Don't retry on auth errors or other permanent failures
        if (lastError.message.includes('Invalid login') || 
            lastError.message.includes('Authentication failed') ||
            lastError.message.includes('535')) {
          console.error(`[ProductAlertNotifier] ${context} - Permanent error detected, not retrying`);
          throw lastError;
        }
        
        if (attempt < ProductAlertNotifier.MAX_RETRIES) {
          const delay = ProductAlertNotifier.RETRY_DELAY * attempt;
          console.log(`[ProductAlertNotifier] ${context} - Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new Error('Failed to send email after retries');
  }

    private smtpBaseConfig(email: string, subject: string) {
    return {
       from: {address: process.env.SMTP_FROM || "equipo@cartago4x4.es",
        name: process.env.SMTP_SENDER || "Cartago4x4"},
        to: email,
        subject,
    };
  }

  sendAdminNotification(
    email: string,
    variant: any,
    product: any,
    variantId: string,
    isNew: boolean
  ): void {
    const adminEmail = process.env.ADMIN_EMAIL || process.env.MAILERSEND_ADMIN_EMAIL;
    if (!adminEmail) return;

    // Send admin notification asynchronously without blocking the main thread
    setImmediate(async () => {
      try {
        const variantTitle = variant.title !== "Default Title"
          ? `${variant.title}`
          : product.title;
        const imageUrl = product.thumbnail || product.images?.[0]?.url;
        const productUrl = `${process.env.STORE_URL || "https://cartago4x4.es"}/products/${product.handle}?variant=${variantId}`;

        const subject = isNew ? `[Copia] Nueva suscripción: ${variantTitle}` : `[Copia] Suscripción: ${variantTitle}`;

        const html = EmailTemplateCompiler.renderTemplate("client-product-subscription-alert", {
          is_new: isNew,
          subscriber_email: email,
          image_url: imageUrl,
          variant_title: variantTitle,
          product_sku: variant.sku || "N/A",
          product_url: productUrl,
          current_year: new Date().getFullYear(),
        });

        if (!html) {
          console.error("[ProductAlertNotifier] Failed to render admin notification template");
          return;
        }

        await this.sendMailWithRetry(
          this.getTransporter(),
          {
            ...this.smtpBaseConfig(adminEmail, subject),
            html,
          },
          `Admin notification for ${email}`
        );

        console.log(
          `[ProductAlertNotifier] Admin notification sent to ${adminEmail} for ${isNew ? 'new' : 'reactivated'} subscription`
        );
      } catch (error) {
        console.error(
          `[ProductAlertNotifier] Failed to send admin notification (async):`,
          error
        );
      }
    });
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
      const transporter = this.getTransporter();
      const emailPromises = subscriptions.map(async (sub) => {
        const unsubscribeUrl = `${process.env.STORE_URL || "https://cartago4x4.es"}/account/alerts/unsubscribe?email=${encodeURIComponent(sub.email)}&variant=${variantId}`;
        
        const html = EmailTemplateCompiler.renderTemplate("back-in-stock-alert", {
          product_name: variantTitle,
          product_url: productUrl,
          product_image: imageUrl,
          product_price: price,
          variant_sku: variant.sku || "",
          unsubscribe_url: unsubscribeUrl,
          current_year: new Date().getFullYear(),
        });

        if (!html) {
          console.error(`[ProductAlertNotifier] Failed to render back-in-stock template for ${sub.email}`);
          return;
        }

        return this.sendMailWithRetry(
          transporter,
          {
            ...this.smtpBaseConfig(sub.email, `¡${variantTitle} está de vuelta en stock!`),
            html,
          },
          `Back-in-stock alert for ${sub.email}`
        );
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

  async sendAdminBackInStockNotification(
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
      const html = EmailTemplateCompiler.renderTemplate("back-in-stock-alert-admin", {
        subscribers_count: subscriptions.length,
        image_url: imageUrl,
        variant_title: variantTitle,
        product_url: productUrl,
        subscribers: subscriptions,
        current_year: new Date().getFullYear(),
      });

      if (!html) {
        console.error("[ProductAlertNotifier] Failed to render admin back-in-stock template");
        return;
      }

      await this.sendMailWithRetry(
        this.getTransporter(),
        {
          ...this.smtpBaseConfig(adminEmail, `[Copia] Aviso de disponibilidad: ${variantTitle}`),
          html,
        },
        `Admin back-in-stock notification for variant ${variantId}`
      );

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

        // Send admin notification asynchronously, don't wait for it
        this.notifier.sendAdminNotification(email, variant, product, variantId, false);

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

      // Send admin notification asynchronously, don't wait for it
      this.notifier.sendAdminNotification(email, variant, product, variantId, false);

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
        `[ProductAlertService] Processing ${pendingSubscriptions.length} subscriptions for variant ${variantId} (emails will be sent asynchronously)`
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

      const variantTitle = variant.title !== "Default Title"
        ? `${variant.title}`
        : product.title;
      const imageUrl = product.thumbnail || product.images?.[0]?.url;
      const productUrl = `${process.env.STORE_URL || "https://cartago4x4.es"}/products/${product.handle}?variant=${variantId}`;

      // Send back-in-stock notifications asynchronously
      setImmediate(async () => {
        try {
          await this.notifier.sendBackInStockNotifications(pendingSubscriptions, variant, product, variantId);

          // Send admin notification
          await this.notifier.sendAdminBackInStockNotification(pendingSubscriptions, variant, product, variantId, variantTitle, imageUrl, productUrl);
        } catch (error) {
          console.error(
            `[ProductAlertService] Failed to send back-in-stock notifications asynchronously:`,
            error
          );
        }
      });
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
