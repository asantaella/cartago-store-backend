import {
  type SubscriberConfig,
  type SubscriberArgs,
  ProductVariantService,
} from "@medusajs/medusa";
import ProductAlertService from "../services/product-alert";

/**
 * Subscriber that listens for variant updates and triggers
 * back-in-stock notifications when inventory changes from 0 to > 0
 */
export default async function handleVariantStockUpdate({
  data,
  eventName,
  container,
}: SubscriberArgs<Record<string, any>>) {
  try {
    console.log(
      `[VARIANT-STOCK-UPDATE] Event ${eventName} received:`,
      JSON.stringify(data)
    );

    // Extract variant ID from event data
    const variantId = data.id;
    if (!variantId) {
      console.warn(
        `[VARIANT-STOCK-UPDATE] No variant ID in event data:`,
        JSON.stringify(data)
      );
      return;
    }

    const productVariantService: ProductVariantService =
      container.resolve("productVariantService");
    const productAlertService: ProductAlertService =
      container.resolve("productAlertService");

    // Use setTimeout to avoid blocking the HTTP response
    setTimeout(async () => {
      try {
        // Retrieve the current variant state
        const variant = await productVariantService.retrieve(variantId);

        // Check if stock is now available
        // Note: We can't directly compare previous vs current stock from the event,
        // so we check if current stock > 0 and there are pending subscriptions
        if (variant.inventory_quantity > 0) {
          const pendingCount =
            await productAlertService.getPendingCount(variantId);

          if (pendingCount > 0) {
            console.log(
              `[VARIANT-STOCK-UPDATE] Variant ${variantId} is back in stock with ${pendingCount} pending subscriptions`
            );

            // Process back in stock notifications
            await productAlertService.processBackInStock(variantId);

            console.log(
              `[VARIANT-STOCK-UPDATE] Processed back-in-stock for variant ${variantId}`
            );
          }
        }
      } catch (error) {
        console.error(
          `[VARIANT-STOCK-UPDATE] Error processing variant ${variantId}:`,
          error
        );
      }
    }, 100); // Small delay to not block the response
  } catch (error) {
    console.error(`[VARIANT-STOCK-UPDATE] Error in subscriber:`, error);
  }
}

export const config: SubscriberConfig = {
  event: ProductVariantService.Events.UPDATED,
  context: {
    subscriberId: "variant-stock-update",
  },
};
