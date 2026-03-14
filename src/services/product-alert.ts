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

const ProductAlertStockEmailNotification =
  require("./product-alert-stock-email-notification").default;

type ProductAlertSubscriptionRepository =
  typeof import("../repositories/product-alert-subscription").default;

interface SubscribeResult {
  success: boolean;
  message: string;
  subscription?: ProductAlertSubscription;
}

// Validation class
class ProductAlertValidator {
  private productVariantService: ProductVariantService;
  private productService: ProductService;

  constructor(
    productVariantService: ProductVariantService,
    productService: ProductService,
  ) {
    this.productVariantService = productVariantService;
    this.productService = productService;
  }

  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async validateVariant(
    variantId: string,
  ): Promise<{ variant: any; product: any } | null> {
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

  async save(
    subscription: ProductAlertSubscription,
  ): Promise<ProductAlertSubscription> {
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
  private notifier;
  private repoManager: ProductAlertRepositoryManager;

  constructor(container) {
    super(container);
    this.productAlertSubscriptionRepository_ =
      container.productAlertSubscriptionRepository;
    this.productVariantService_ = container.productVariantService;
    this.productService_ = container.productService;
    this.validator = new ProductAlertValidator(
      this.productVariantService_,
      this.productService_,
    );
    // Initialize notifier to ensure email notifications can be sent
    this.notifier = new ProductAlertStockEmailNotification();
    this.repoManager = new ProductAlertRepositoryManager(
      this.productAlertSubscriptionRepository_,
    );
  }

  /**
   * Subscribe an email to receive notifications when a variant is back in stock
   */
  async subscribe(email: string, variantId: string): Promise<SubscribeResult> {
    return this.atomicPhase_(async (manager) => {
      const repo = manager.withRepository(
        this.productAlertSubscriptionRepository_,
      );
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
        const reactivatedSubscription =
          await this.repoManager.save(existingSubscription);

        console.log(
          `[ProductAlertService] Reactivated subscription ${reactivatedSubscription.id} for ${email} on variant ${variantId}`,
        );

        // Send admin notification asynchronously, don't wait for it
        this.notifier.sendSubscriptionAdminNotification(
          email,
          variant,
          product,
          variantId,
          false,
        );

        return {
          success: true,
          message:
            "Suscripción reactivada. Te notificaremos cuando esté disponible.",
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
        `[ProductAlertService] Created subscription ${savedSubscription.id} for ${email} on variant ${variantId}`,
      );

      // Send admin notification asynchronously, don't wait for it
      this.notifier.sendSubscriptionAdminNotification(
        email,
        variant,
        product,
        variantId,
        true,
      );

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
    variantId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.atomicPhase_(async (manager) => {
      const repo = manager.withRepository(
        this.productAlertSubscriptionRepository_,
      );
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
        `[ProductAlertService] Cancelled subscription ${subscription.id}`,
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
      const repo = manager.withRepository(
        this.productAlertSubscriptionRepository_,
      );
      this.repoManager = new ProductAlertRepositoryManager(repo);

      const pendingSubscriptions = await this.repoManager.find({
        variant_id: variantId,
        status: ProductAlertStatus.PENDING,
      });

      if (pendingSubscriptions.length === 0) {
        console.log(
          `[ProductAlertService] No pending subscriptions for variant ${variantId}`,
        );
        return;
      }

      console.log(
        `[ProductAlertService] Processing ${pendingSubscriptions.length} subscriptions for variant ${variantId} (emails will be sent asynchronously)`,
      );

      const variantProduct = await this.validator.validateVariant(variantId);
      if (!variantProduct) {
        console.error(
          `[ProductAlertService] Failed to retrieve variant ${variantId}`,
        );
        return;
      }
      const { variant, product } = variantProduct;

      // await this.brevoOps.syncVariant(variant, product);

      const variantTitle =
        variant.title !== "Default Title" ? `${variant.title}` : product.title;
      const imageUrl = product.thumbnail || product.images?.[0]?.url;
      const productUrl = `${process.env.STORE_URL || "https://cartago4x4.es"}/products/${product.handle}?variant=${variantId}`;

      // Send back-in-stock notifications asynchronously
      setImmediate(async () => {
        try {
          await this.notifier.sendBackInStockNotifications(
            pendingSubscriptions,
            variant,
            product,
            variantId,
          );
        } catch (error) {
          console.error(
            `[ProductAlertService] Failed to send back-in-stock notifications asynchronously:`,
            error,
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
        `[ProductAlertService] Marked ${pendingSubscriptions.length} subscriptions as notified`,
      );

      console.log(
        `[ProductAlertService] Completed processing back in stock for variant ${variantId}`,
      );
    });
  }

  /**
   * Get all subscriptions for an email
   */
  async listByEmail(email: string): Promise<ProductAlertSubscription[]> {
    const repo = this.activeManager_.withRepository(
      this.productAlertSubscriptionRepository_,
    );
    this.repoManager = new ProductAlertRepositoryManager(repo);

    return this.repoManager.find(
      { email: email.toLowerCase() },
      { created_at: "DESC" },
    );
  }

  /**
   * Get pending subscriptions count for a variant
   */
  async getPendingCount(variantId: string): Promise<number> {
    const repo = this.activeManager_.withRepository(
      this.productAlertSubscriptionRepository_,
    );
    this.repoManager = new ProductAlertRepositoryManager(repo);

    return this.repoManager.count({
      variant_id: variantId,
      status: ProductAlertStatus.PENDING,
    });
  }
}

export default ProductAlertService;
