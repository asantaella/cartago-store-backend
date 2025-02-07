import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;

  try {
    const invoiceService = req.scope.resolve("invoiceGeneratorService");
   
    const pdf = await invoiceService.generateInvoice(id);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.fileName}"`,
      "Content-Length": pdf.buffer.length,
    });

    // Enviar el PDF como respuesta
    res.end(pdf.buffer);
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).send("Failed to generate invoice");
  }
};
