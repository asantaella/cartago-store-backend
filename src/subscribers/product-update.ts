import {
  type SubscriberConfig,
  type SubscriberArgs,
  ProductService,
  ProductVariantService,
} from "@medusajs/medusa"
import AlgoliaService from "../services/algolia"
import { ProductStatus } from "@medusajs/types"

async function ensureManageInventory(
  variantId: string,
  container: SubscriberArgs<Record<string, any>>["container"]
) {
  const variantService: ProductVariantService =
    container.resolve("productVariantService")
  await variantService.update(variantId, { manage_inventory: true })
  console.log(
    `[PRODUCT-UPDATE] manage_inventory=true set on variant ${variantId}`
  )
}

export default async function handleProductUpdate({
  data,
  eventName,
  container,
}: SubscriberArgs<Record<string, any>>) {
  try {
    console.log(
      `[PRODUCT-UPDATE] Evento ${eventName} recibido para producto ${JSON.stringify(
        data
      )}`
    )
    const productId = data.product_id || data.id;
    if (!productId) {
      console.warn(
        `[PRODUCT-UPDATE] No se encontró product_id en los datos del evento: ${JSON.stringify(
          data
        )}`
      )
      return;
    }
    const productService: ProductService = container.resolve("productService");
    const algoliaService: AlgoliaService = container.resolve("algoliaService");

    // Usar setTimeout para evitar bloqueos en la respuesta HTTP
    setTimeout(async () => {
      try {
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
          ],
        })

        // Sincronizar con Algolia de forma asíncrona
        if (product.status === ProductStatus.PUBLISHED) {
          await algoliaService.syncProduct(product)
        }

        // Default manage_inventory=true on product creation: enforce on
        // every variant the product was created with. Idempotent: a noop
        // when the value is already true.
        if (eventName === ProductService.Events.CREATED) {
          const variants = product.variants || []
          for (const variant of variants) {
            if (variant?.id) {
              await ensureManageInventory(variant.id, container)
            }
          }
        }

        // Default manage_inventory=true on variant creation. Catches
        // variants added later via addVariant / admin UI / API.
        if (eventName === ProductVariantService.Events.CREATED) {
          const variantId = data.variant_id || data.id
          if (variantId) {
            await ensureManageInventory(variantId, container)
          }
        }

        console.log(
          `[PRODUCT-UPDATE] Producto ${productId} procesado correctamente`
        )
      } catch (error) {
        console.error(
          `[PRODUCT-UPDATE] Error procesando producto ${productId}:`,
          error
        )
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
