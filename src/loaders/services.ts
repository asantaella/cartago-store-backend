//import InvoiceGenerator from "../services/invoice-pdf-generator";
//import InvoiceNumberGeneratorService from "../services/invoice-number-generator";
import { AwilixContainer } from "awilix";

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

export default async ({ container }: { container: Container }) => {
  // container.register(
  //   "invoicePDFGeneratorService",
  //   (c: AwilixContainer) => new InvoiceGenerator(c)
  // );
  // container.register(
  //   "invoiceNumberGenerator",
  //   (c: AwilixContainer) => new InvoiceNumberGeneratorService(c)
  // );
};
