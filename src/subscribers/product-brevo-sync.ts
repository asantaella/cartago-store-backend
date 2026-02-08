import {
  type SubscriberConfig,
  type SubscriberArgs,
  ProductService,
  ProductVariantService,
} from "@medusajs/medusa";
import BrevoEcommerceService from "../services/brevo-ecommerce";

/**
 * Subscriber that syncs products and variants to Brevo E-commerce catalog
 * on create and update events (on-demand synchronization)
 */
export default async function handleProductBrevoSync({
  data,
  eventName,
  container,
}: SubscriberArgs<Record<string, any>>) {
  try {
    console.log(
      `[PRODUCT-BREVO-SYNC] Event ${eventName} received:`,
      JSON.stringify(data)
    );

    const brevoEcommerceService: BrevoEcommerceService = container.resolve(
      "brevoEcommerceService"
    );
    const productService: ProductService = container.resolve("productService");
    const productVariantService: ProductVariantService = container.resolve(
      "productVariantService"
    );

    // Use setTimeout to avoid blocking the HTTP response
    setTimeout(async () => {
      try {
        // Handle product events
        if (
          eventName === ProductService.Events.CREATED ||
          eventName === ProductService.Events.UPDATED
        ) {
          const productId = data.id;
          if (!productId) {
            console.warn(
              `[PRODUCT-BREVO-SYNC] No product ID in event data:`,
              JSON.stringify(data)
            );
            return;
          }

          // Retrieve product with all relations needed for sync
          const product = await productService.retrieve(productId, {
            relations: ["variants", "variants.prices", "images"],
          });

          // Sync the product
          await brevoEcommerceService.syncProduct(product);

          // Sync all variants
          for (const variant of product.variants || []) {
            await brevoEcommerceService.syncVariant(variant, product);
          }

          console.log(
            `[PRODUCT-BREVO-SYNC] Product ${productId} synced to Brevo`
          );
        }

        // Handle variant events
        if (
          eventName === ProductVariantService.Events.CREATED ||
          eventName === ProductVariantService.Events.UPDATED
        ) {
          const variantId = data.id;
          if (!variantId) {
            console.warn(
              `[PRODUCT-BREVO-SYNC] No variant ID in event data:`,
              JSON.stringify(data)
            );
            return;
          }

          // Retrieve variant and its product
          const variant = await productVariantService.retrieve(variantId, {
            relations: ["product", "prices"],
          });

          const product = await productService.retrieve(variant.product_id, {
            relations: ["images", "variants", "variants.prices"],
          });

          // Ensure parent product exists in Brevo, then sync the variant
          try {
            await brevoEcommerceService.syncProduct(product);
          } catch (err) {
            console.warn(
              `[PRODUCT-BREVO-SYNC] Warning: failed to sync parent product ${product.id} before variant ${variantId}:`,
              err
            );
          }

          // Sync the variant
          await brevoEcommerceService.syncVariant(variant, product);

          console.log(
            `[PRODUCT-BREVO-SYNC] Variant ${variantId} synced to Brevo`
          );
        }
      } catch (error) {
        console.error(
          `[PRODUCT-BREVO-SYNC] Error processing event ${eventName}:`,
          error
        );
      }
    }, 200); // Small delay to not block the response
  } catch (error) {
    console.error(`[PRODUCT-BREVO-SYNC] Error in subscriber:`, error);
  }
}

export const config: SubscriberConfig = {
  event: [
  
  ],
  context: {
    subscriberId: "product-brevo-sync",
  },
};
