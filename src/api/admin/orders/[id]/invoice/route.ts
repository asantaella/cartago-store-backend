import { MedusaRequest, MedusaResponse, Order } from "@medusajs/medusa";
import OrderPlacedNotificationService from "../../../../../services/order-placed-notification";
import ShipmentNotificationService from "../../../../../services/shipment-notification";

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const id = req.params.id as string;
    const toClient = req.query.toClient === "true";
    const toAdmin = req.query.toAdmin === "true";
    const showTrackingDeliverySection = req.query.showTrackingDeliverySection === "true";

    if (!id) {
      return res.status(400).json({
        message: "Order ID is required",
      });
    }

    if (!toClient && !toAdmin) {
      return res.status(400).json({
        message: "At least one of toClient or toAdmin must be true",
      });
    }

    const orderNotificationService = new OrderPlacedNotificationService(
      req.scope,
    );
    const shipmentNotificationService: ShipmentNotificationService =
      req.scope.resolve("shipmentNotificationService");

    const order: Order =
      await orderNotificationService.retrieveOrderWithRelations(id);

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const results: Record<string, { status: string; to: string; message: string }> = {};

    if (toClient) {
      const clientNotification =
        await shipmentNotificationService.sendInvoiceNotification(order, {
          toClient: true,
          toAdmin: false,
          showTrackingDeliverySection, // No mostrar sección de seguimiento en notificación de factura
        });

      results.toClient = {
        status: clientNotification.status,
        to: clientNotification.to,
        message:
          clientNotification.status === "sent"
            ? "Invoice sent to customer successfully"
            : "Failed to send invoice to customer",
      };
    }

    if (toAdmin) {
      const adminNotification =
        await shipmentNotificationService.sendInvoiceNotification(order, {
          toClient: false,
          toAdmin: true,
          showTrackingDeliverySection
        });

      results.toAdmin = {
        status: adminNotification.status,
        to: adminNotification.to,
        message:
          adminNotification.status === "sent"
            ? "Invoice sent to admin successfully"
            : "Failed to send invoice to admin",
      };
    }

    return res.status(200).json({
      message: "Invoice notification(s) processed",
      orderId: id,
      results,
    });
  } catch (error) {
    console.error("[NOTIFICATION] Error in invoice endpoint:", error);

    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;

  try {
    const invoiceService = req.scope.resolve("invoicePdfGeneratorService");
    const pdf = await invoiceService.generateInvoice(id);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Cartago4x4"`,
      "Content-Length": pdf.buffer.length,
      "Access-Control-Allow-Origin": `${process.env.ADMIN_CORS}`,
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
