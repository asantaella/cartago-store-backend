import {
  type SubscriberConfig,
  type SubscriberArgs,
  ProductService,
  ProductVariantService,
} from "@medusajs/medusa";
import AlgoliaService from "../services/algolia";
import { ProductStatus } from "@medusajs/types";

async function ensureManageInventory(
  variantId: string,
  container: SubscriberArgs<Record<string, any>>["container"],
) {
  const variantService: ProductVariantService = container.resolve(
    "productVariantService",
  );
  await variantService.update(variantId, {
    manage_inventory: true,
    allow_backorder: false,
  });
  console.log(
    `[PRODUCT-UPDATE] manage_inventory=true set on variant ${variantId}`,
  );
}

async function ensureAllowBackorder(
  variantId: string,
  container: SubscriberArgs<Record<string, any>>["container"],
) {
  const variantService: ProductVariantService = container.resolve(
    "productVariantService",
  );
  await variantService.update(variantId, { allow_backorder: true });
  console.log(
    `[PRODUCT-UPDATE] allow_backorder=true set on variant ${variantId}`,
  );
}

// Core logic, extracted so it is directly awaitable from tests and
// reusable if a future event source wants to call it without the
// setTimeout wrapper. The setTimeout below is preserved verbatim to
// keep the existing "do not block the HTTP response" behavior.
export async function processProductUpdate({
  data,
  eventName,
  container,
}: SubscriberArgs<Record<string, any>>) {
  const productId = data.product_id || data.id;
  if (!productId) {
    console.warn(
      `[PRODUCT-UPDATE] No se encontró product_id en los datos del evento: ${JSON.stringify(
        data,
      )}`,
    );
    return;
  }
  const productService: ProductService = container.resolve("productService");
  const algoliaService: AlgoliaService = container.resolve("algoliaService");

  // Recuperar el producto con todas las relaciones necesarias
  const product = await productService.retrieve(productId, {
    relations: [
      "variants",
      "variants.prices",
      "variants.options",
      "options",
      "tags",
      "images",
      "categories",
      "collection",
    ],
  });

  // Sincronizar con Algolia de forma asíncrona
  if (product.status === ProductStatus.PUBLISHED) {
    await algoliaService.syncProduct(product);
  }

  // Default manage_inventory=true on product creation: enforce on
  // every variant the product was created with. Idempotent: a noop
  // when the value is already true.
  if (
    eventName === ProductService.Events.CREATED ||
    eventName === ProductService.Events.UPDATED
  ) {
    const variants = product.variants || [];
    for (const variant of variants) {
      if (variant?.id) {
        await ensureManageInventory(variant.id, container);
      }
    }
  }

  // Default manage_inventory=true on variant creation. Catches
  // variants added later via addVariant / admin UI / API.
  if (
    eventName === ProductVariantService.Events.CREATED ||
    eventName === ProductVariantService.Events.UPDATED
  ) {
    const variantId = data.variant_id || data.id;
    if (variantId) {
      await ensureManageInventory(variantId, container);
    }
  }

  // allow_backorder=true for products in the shipping exception collection
  const shippingExceptionCollectionHandle =
    process.env.COLLECTION_SHIPPING_EXCEPTION;
  const productCollectionHandle = product.collection?.handle;

  if (
    shippingExceptionCollectionHandle &&
    productCollectionHandle === shippingExceptionCollectionHandle
  ) {
    if (
      eventName === ProductService.Events.CREATED ||
      eventName === ProductService.Events.UPDATED
    ) {
      const variants = product.variants || [];
      for (const variant of variants) {
        if (variant?.id) {
          await ensureAllowBackorder(variant.id, container);
        }
      }
    }

    if (
      eventName === ProductVariantService.Events.CREATED ||
      eventName === ProductVariantService.Events.UPDATED
    ) {
      const variantId = data.variant_id || data.id;
      if (variantId) {
        await ensureAllowBackorder(variantId, container);
      }
    }
  }

  console.log(`[PRODUCT-UPDATE] Producto ${productId} procesado correctamente`);
}

export default async function handleProductUpdate(
  args: SubscriberArgs<Record<string, any>>,
) {
  const { data, eventName, container, pluginOptions } = args;
  try {
    console.log(
      `[PRODUCT-UPDATE] Evento ${eventName} recibido para producto ${JSON.stringify(
        data,
      )}`,
    );
    // Usar setTimeout para evitar bloqueos en la respuesta HTTP
    setTimeout(async () => {
      try {
        await processProductUpdate({
          data,
          eventName,
          container,
          pluginOptions,
        });
      } catch (error) {
        console.error(
          `[PRODUCT-UPDATE] Error procesando producto ${data?.product_id || data?.id}:`,
          error,
        );
      }
    }, 100); // Pequeño delay para no bloquear la respuesta
  } catch (error) {
    console.error(`[PRODUCT-UPDATE] Error en subscriber:`, error);
  }
}

export const config: SubscriberConfig = {
  event: [
    ProductService.Events.CREATED,
    ProductService.Events.UPDATED,
    ProductVariantService.Events.UPDATED,
    ProductVariantService.Events.CREATED,
  ],
  context: { subscriberId: "product-update" },
};
