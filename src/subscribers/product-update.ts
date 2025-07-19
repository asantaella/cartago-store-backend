import {
  type SubscriberConfig,
  type SubscriberArgs,
  ProductService,
} from "@medusajs/medusa";
import AlgoliaService from "../services/algolia";

export default async function handleProductUpdate({
  data,
  eventName,
  container,
}: SubscriberArgs<Record<string, any>>) {
  try {
    console.log(
      `[PRODUCT-UPDATE] Evento ${eventName} recibido para producto ${data.id}`
    );

    const productService: ProductService = container.resolve("productService");
    const algoliaService: AlgoliaService = container.resolve("algoliaService");

    // Usar setTimeout para evitar bloqueos en la respuesta HTTP
    setTimeout(async () => {
      try {
        // Recuperar el producto con todas las relaciones necesarias
        const product = await productService.retrieve(data.id, {
          relations: [
            "variants",
            "variants.prices",
            "variants.options",
            "options",
            "tags",
            "images",
            "categories",
          ],
        });

        // Sincronizar con Algolia de forma asíncrona
        await algoliaService.syncProduct(product);

        console.log(
          `[PRODUCT-UPDATE] Producto ${data.id} procesado correctamente`
        );
      } catch (error) {
        console.error(
          `[PRODUCT-UPDATE] Error procesando producto ${data.id}:`,
          error
        );
      }
    }, 100); // Pequeño delay para no bloquear la respuesta
  } catch (error) {
    console.error(`[PRODUCT-UPDATE] Error en subscriber:`, error);
  }
}

export const config: SubscriberConfig = {
  event: [ProductService.Events.CREATED, ProductService.Events.UPDATED],
  context: { subscriberId: "product-update" },
};
