import InvoiceGenerator from "../services/invoice-generator";
import OrderInvoiceService from "../services/order-invoice";
import { AwilixContainer } from "awilix";

interface Container {
  register: (name: string, factory: (c: AwilixContainer) => any) => void;
}

export default async ({ container }: { container: Container }) => {
  container.register(
    "invoiceGeneratorService",
    (c: AwilixContainer) => new InvoiceGenerator(c)
  );

  container.register(
    "orderInvoiceService",
    (c: AwilixContainer) => new OrderInvoiceService(c)
  );
};
