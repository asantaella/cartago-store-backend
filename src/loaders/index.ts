import { MedusaContainer } from "@medusajs/medusa";
import AlgoliaService from "../services/algolia";

export default async function customLoader(
  container: MedusaContainer,
  options: any
) {
  // Registrar el servicio de Algolia
  container.register({
    algoliaService: {
      resolve: () => AlgoliaService,
    },
  });

  // Registrar la clase del servicio
  container.registerAdd("algoliaService", AlgoliaService);
}
