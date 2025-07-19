import { asClass, asValue, createContainer } from "awilix";
import { MedusaContainer } from "@medusajs/medusa";
import AlgoliaService from "../services/algolia";

export default async function servicesLoader(
  container: MedusaContainer,
  options: any
) {
  try {
    container.register({
      algoliaService: asClass(AlgoliaService).singleton(),
    });

    console.log("[SERVICES] AlgoliaService registrado correctamente");
  } catch (error) {
    console.error("[SERVICES] Error registrando servicios:", error);
  }
}
