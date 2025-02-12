import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import cors from "cors";

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = process.env.STORE_CORS
      ? process.env.STORE_CORS.split(",").map(
          (pattern) => new RegExp(pattern.trim())
        )
      : [/\.cartago4x4\.es$/];

    console.log("VALIDATING CORS...", origin);
    console.log("ALLOWED ORIGINS...", allowedOrigins);
    if (!origin || allowedOrigins.some((o) => o.test(origin))) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
};
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  cors(corsOptions)(req, res, async () => {
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
  });
};
