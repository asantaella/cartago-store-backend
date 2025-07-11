import { algoliasearch } from "algoliasearch";
import {
  type SubscriberConfig,
  type SubscriberArgs,
  ProductService,
} from "@medusajs/medusa";

export default async function handleProductEvent({
  data,
  eventName,
  container,
}: SubscriberArgs<Record<string, any>>) {
  try {
    console.log(
      `[ALGOLIA] Producto ${eventName} handler iniciado para producto ${data.id}`
    );

    const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID as string;
    const ALGOLIA_API_KEY = process.env.ALGOLIA_API_KEY as string;
    const ALGOLIA_INDEX_NAME = process.env.ALGOLIA_INDEX_NAME as string;
    console.log("ALGOLIA_APP_ID:", ALGOLIA_APP_ID);
    console.log("ALGOLIA_API_KEY:", ALGOLIA_API_KEY);
    console.log("ALGOLIA_INDEX_NAME:", ALGOLIA_INDEX_NAME);

    if (!ALGOLIA_APP_ID || !ALGOLIA_API_KEY || !ALGOLIA_INDEX_NAME) {
      console.error("[ALGOLIA] Faltan variables de entorno para Algolia");
      return;
    }

    const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_API_KEY);

    // Obtener servicio de productos
    const productService: ProductService = container.resolve("productService");

    // Recuperar el producto con todas las relaciones necesarias
    const product = await productService.retrieve(data.id, {
      relations: [
        "variants",
        "variants.prices",
        "variants.options",
        "options",
        "tags",
        "images",
      ],
    });

    // Preparar objeto para Algolia
    const algoliaProduct = {
      objectID: product.id,
      id: product.id,
      title: product.title,
      handle: product.handle,
      thumbnail: product.thumbnail,
      tags: product.tags?.map((t) => t.value) ?? [],
      created_at: product.created_at,
      updated_at: product.updated_at,
    };

    // Sincronizar con Algolia usando la nueva API v5
    await client.saveObject({
      indexName: ALGOLIA_INDEX_NAME,
      body: algoliaProduct,
    });
  } catch (error) {
    console.error(
      `[ALGOLIA] Error procesando sincronización de producto:`,
      error
    );
  }
}

export const config: SubscriberConfig = {
  event: [ProductService.Events.CREATED, ProductService.Events.UPDATED],
  context: { subscriberId: "product-algolia-sync" },
};
