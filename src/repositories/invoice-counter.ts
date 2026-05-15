import { dataSource } from "@medusajs/medusa/dist/loaders/database";
import { InvoiceCounter } from "../models/invoice";

const InvoiceCounterRepository = dataSource.getRepository(InvoiceCounter);

export default InvoiceCounterRepository;
