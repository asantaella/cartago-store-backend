import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import InvoicePdfGeneratorService from "../../../../../services/invoice-pdf-generator";
import { InvoiceMode } from "../../../../../types/order-invoice.model";

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;
  const { invoiceMode } = req.query as { invoiceMode?: InvoiceMode };

  try {
    console.log("INVOICE MODE =>>", invoiceMode);
    const invoiceService: InvoicePdfGeneratorService = req.scope.resolve(
      "invoicePdfGeneratorService"
    );

    const pdf = await invoiceService.generateInvoice(id, invoiceMode);
    console.log("PDF filename =>>", pdf.fileName);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.fileName}"`,
      "Content-Length": pdf.buffer.length,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        " Content-Type, Authorization, X-Requested-With",
    });

    // Enviar el PDF como respuesta
    res.end(pdf.buffer);
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).send("Failed to generate invoice");
  }
};

export const OPTIONS = async (req: MedusaRequest, res: MedusaResponse) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
  });

  // Enviar respuesta sin cuerpo (status 204 o 200)
  return res.status(204).send();
};
//export const CORS = false;
