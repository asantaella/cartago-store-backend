import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { EntityManager } from "typeorm";
import InvoiceNumberGeneratorService from "../../../services/invoice-number-generator";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const invoiceService: InvoiceNumberGeneratorService = req.scope.resolve(
    "invoiceNumberGeneratorService",
  );

  const counter = await invoiceService.getCounter();

  res.status(200).json({ counter });
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const { counter } = req.body as { counter: unknown };

  if (
    typeof counter !== "number" ||
    !Number.isInteger(counter) ||
    counter < 0
  ) {
    return res
      .status(400)
      .json({ message: "counter must be a non-negative integer" });
  }

  const invoiceService: InvoiceNumberGeneratorService = req.scope.resolve(
    "invoiceNumberGeneratorService",
  );
  const manager: EntityManager = req.scope.resolve("manager");

  const updated = await manager.transaction(async (transactionManager) => {
    return await invoiceService
      .withTransaction(transactionManager)
      .setCounter(counter);
  });

  res.status(200).json({ counter: updated });
}
