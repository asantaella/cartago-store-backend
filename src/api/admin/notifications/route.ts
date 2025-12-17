import { Router, Request, Response } from "express";
import { Order, OrderService } from "@medusajs/medusa";
import ReceiptNotificationService from "../../../services/receipt-notification";

export default (rootRouter: Router) => {
  const router = Router();

  /**
   * POST /admin/orders/:id/receipt
   * Envía las receipt notifications para una orden específica
   *
   * Query params:
   * - toClient: boolean (true/false) - Envía notificación al cliente
   * - toAdmin: boolean (true/false) - Envía notificación al administrador
   */
  router.post("/orders/:id/receipt", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const toClient = req.query.toClient === "true";
      const toAdmin = req.query.toAdmin === "true";

      // Validaciones
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

      // Obtener servicios del contenedor
      const orderService: OrderService = req.scope.resolve("orderService");
      const receiptNotificationService: ReceiptNotificationService =
        req.scope.resolve("receiptNotificationService");

      // Verificar que la orden existe
      const order = await orderService.retrieve(id);

      if (!order) {
        return res.status(404).json({
          message: "Order not found",
        });
      }

      const results: Record<string, any> = {};

      // Enviar notificación al cliente si está habilitado
      if (toClient) {
        try {
          const clientNotification =
            await receiptNotificationService.sendNotification(
              "order.placed",
              order
            );
          results.toClient = {
            status: clientNotification.status,
            to: clientNotification.to,
            message: "Receipt sent to customer successfully",
          };
        } catch (error) {
          results.toClient = {
            status: "failed",
            message: `Failed to send receipt to customer: ${error.message}`,
          };
        }
      }

      // Enviar notificación al administrador si está habilitado
      if (toAdmin) {
        try {
          const adminNotification =
            await receiptNotificationService.sendNotificationToAdmin(
              "order.placed",
              order,
              "sent"
            );
          results.toAdmin = {
            status: adminNotification.status,
            to: adminNotification.to,
            message: "Receipt sent to admin successfully",
          };
        } catch (error) {
          results.toAdmin = {
            status: "failed",
            message: `Failed to send receipt to admin: ${error.message}`,
          };
        }
      }

      return res.status(200).json({
        message: "Receipt notification(s) processed",
        orderId: id,
        results,
      });
    } catch (error) {
      console.error("[NOTIFICATION] Error in receipt endpoint:", error);

      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  });

  rootRouter.use("/admin", router);
};
