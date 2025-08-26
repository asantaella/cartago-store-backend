import { Router } from "express";

export default (router) => {
  /**
   * GET /store/orders/:id/invoice
   * Downloads the invoice PDF for a specific order.
   */
  router.get("/store/orders/:id/invoice", async (req, res) => {
    const { id: orderId } = req.params as { id?: string };

    try {
      if (!orderId) {
        return res.status(400).json({ message: "Missing order id" });
      }
      const invoiceService = req.scope.resolve("invoiceService");
      const pdfBuffer = await invoiceService.generateInvoice(orderId);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=Cartago4x4-invoice-${orderId}.pdf`
      );
      res.send(pdfBuffer);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to generate invoice." });
    }
  });

  return router;
};
