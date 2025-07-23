//import InvoiceGenerator from "../services/invoice-pdf-generator";
//import InvoiceNumberGeneratorService from "../services/invoice-number-generator";
import { AwilixContainer } from "awilix";

interface Container {
  register: (name: string, factory: (c: AwilixContainer) => any) => void;
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
