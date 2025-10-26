import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import LabelShipmentPrintService from "../../../../../services/label-shipment-print";

/**
 * Endpoint GET para transformar un pedido de Medusa a la entidad de pre-registro de Correos
 *
 * @route GET /admin/orders/:id/preregister
 * @param id - ID del pedido a transformar
 * @returns PreregisterDto - DTO listo para enviar a la API de Correos
 *
 * @example
 * GET /admin/orders/order_01H1VT5VXKQY7W8D6BQZPJ7J7E/preregister/validate
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;

  try {
    const labelShipmentPrintService =
      req.scope.resolve<LabelShipmentPrintService>("labelShipmentPrintService");

    console.log("\n🚀 Printing label order with id: ", id);

    const response = await labelShipmentPrintService.generateLabel(id);

    const errors = response.error;

    if (!response || errors) {
      console.error(
        "Error validating preregister order with Correos:",
        response
      );
      return res.status(409).json(errors);
    }
    const orderNumber = response.orderNumber || "";
    //const shipmentCode = response.shipmentCode || "";
    const pdfBuffer = Buffer.from(response.pdf, "base64");
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Cartago4x4-Etiqueta-${orderNumber}.pdf"`,
      "Content-Length": pdfBuffer.length,
      "Access-Control-Allow-Origin": `${process.env.ADMIN_CORS}`,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        " Content-Type, Authorization, X-Requested-With",
    });

    // Enviar el PDF como respuesta
    res.end(pdfBuffer);
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).send("Failed to generate invoice");
  }
};

/**
 * Endpoint OPTIONS para manejar preflight requests de CORS
 */
export const OPTIONS = async (req: MedusaRequest, res: MedusaResponse) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
  });

  return res.status(204).send();
};
