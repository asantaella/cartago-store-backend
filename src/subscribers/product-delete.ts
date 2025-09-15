import {
  type SubscriberConfig,
  type SubscriberArgs,
  ProductService,
} from "@medusajs/medusa";
import AlgoliaService from "../services/algolia";

export default async function handleProductDelete({
  data,
  eventName,
  container,
}: SubscriberArgs<Record<string, any>>) {
  try {
    console.log(
      `[PRODUCT-DELETE] Evento ${eventName} recibido para producto ${data.id}`
    );

    const algoliaService: AlgoliaService = container.resolve("algoliaService");

    // Usar setTimeout para evitar bloqueos en la respuesta HTTP
    setTimeout(async () => {
      try {
        // Eliminar el producto del índice de Algolia
        await algoliaService.deleteProduct(data.id);

        console.log(
          `[PRODUCT-DELETE] Producto ${data.id} eliminado de Algolia correctamente`
        );
      } catch (error) {
        console.error(
          `[PRODUCT-DELETE] Error eliminando producto ${data.id} de Algolia:`,
          error
        );
      }
    }, 100); // Pequeño delay para no bloquear la respuesta
  } catch (error) {
    console.error(`[PRODUCT-DELETE] Error en subscriber:`, error);
  }
}

export const config: SubscriberConfig = {
  event: ProductService.Events.DELETED,
  context: { subscriberId: "product-delete" },
};
