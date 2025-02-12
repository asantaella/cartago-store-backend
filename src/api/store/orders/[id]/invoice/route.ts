import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;

  try {
    const invoiceService = req.scope.resolve("invoiceGeneratorService");

    const pdf = await invoiceService.generateInvoice(id);
    console.log("PDF filename =>>", pdf.fileName);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Cartago4x4"`,
      "Content-Length": pdf.buffer.length,
    });

    // Enviar el PDF como respuesta
    res.end(pdf.buffer);
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).send("Failed to generate invoice");
  }
};
//export const CORS = false;
