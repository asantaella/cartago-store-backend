import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { MedusaOrderToCorreosOrderMapper } from "../../../../../services/mappers/medusa-order-to-correos-order";
import e from "express";
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
    const labelShipmentPrintService = req.scope.resolve<LabelShipmentPrintService>(
      "labelShipmentPrintService"
    );

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
    const shipmentCode = response.shipmentCode || "";
    const pdfBuffer = Buffer.from(response.pdf, "base64");
    // Configurar headers CORS
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Etiqueta-${orderNumber}-${shipmentCode}.pdf`
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error transforming order to Correos preregister:", error);

    // Enviar error detallado
    return res.status(500).json({
      message: "Failed to transform order to Correos preregister",
      error: error instanceof Error ? error.message : "Unknown error",
    });
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
