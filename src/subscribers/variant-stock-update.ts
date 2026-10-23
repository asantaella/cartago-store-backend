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
  pluginOptions,
}: SubscriberArgs<Record<string, any>>) {
  try {
    console.log(
      `[VARIANT-STOCK-UPDATE] Event ${eventName} received:`,
      JSON.stringify(data),
    );

    const variantId = data.id || data.variant_id;
    if (!variantId) {
      console.warn(
        `[VARIANT-STOCK-UPDATE] No variant ID in event data:`,
        JSON.stringify(data),
      );
      return;
    }

    // Use setTimeout to avoid blocking the HTTP response
    setTimeout(async () => {
      try {
        await processVariantStockUpdate({
          data: { ...data, id: variantId },
          eventName,
          container,
          pluginOptions,
        });
      } catch (error) {
        console.error(
          `[VARIANT-STOCK-UPDATE] Error processing variant ${variantId}:`,
          error,
        );
      }
    }, 100); // Small delay to not block the response
  } catch (error) {
    console.error(`[VARIANT-STOCK-UPDATE] Error in subscriber:`, error);
  }
}

const STOCK_SNAPSHOT_KEY = "stock_zero_alert_last_inventory_quantity";

/**
 * Process only stock changes (and creation for initial snapshot setup). Medusa's
 * update event contains the changed fields, but not their previous values, so
 * the snapshot is compared with the delayed current read.
 */
export async function processVariantStockUpdate({
  data,
  eventName,
  container,
}: SubscriberArgs<Record<string, any>>) {
  const isCreated = eventName === ProductVariantService.Events.CREATED;
  const isInventoryUpdate =
    eventName === ProductVariantService.Events.UPDATED &&
    Array.isArray(data.fields) &&
    data.fields.includes("inventory_quantity");

  if (!isCreated && !isInventoryUpdate) {
    return;
  }

  const variantId = data.id || data.variant_id;
  if (!variantId) {
    return;
  }

  const productVariantService: ProductVariantService = container.resolve(
    "productVariantService",
  );
  const variant = await productVariantService.retrieve(variantId);
  const currentQuantity = variant.inventory_quantity ?? 0;
  const previousQuantity = variant.metadata?.[STOCK_SNAPSHOT_KEY];

  await productVariantService.update(variantId, {
    metadata: {
      ...(variant.metadata || {}),
      [STOCK_SNAPSHOT_KEY]: currentQuantity,
    },
  });

  if (isCreated || typeof previousQuantity !== "number") {
    return;
  }

  const productAlertService: ProductAlertService = container.resolve(
    "productAlertService",
  );

  if (previousQuantity > 0 && currentQuantity === 0) {
    try {
      await productAlertService.notifyAdminStockZero(variantId);
    } catch (error) {
      console.error(
        `[VARIANT-STOCK-UPDATE] Failed to send stock-zero admin alert for variant ${variantId}:`,
        error,
      );
    }
    return;
  }

  if (previousQuantity <= 0 && currentQuantity > 0) {
    const pendingCount = await productAlertService.getPendingCount(variantId);

    if (pendingCount > 0) {
      console.log(
        `[VARIANT-STOCK-UPDATE] Variant ${variantId} is back in stock with ${pendingCount} pending subscriptions`,
      );
      await productAlertService.processBackInStock(variantId);
      console.log(
        `[VARIANT-STOCK-UPDATE] Processed back-in-stock for variant ${variantId}`,
      );
    }
  }
}

export const config: SubscriberConfig = {
  event: [
    ProductVariantService.Events.CREATED,
    ProductVariantService.Events.UPDATED,
  ],
  context: {
    subscriberId: "variant-stock-update",
  },
};
