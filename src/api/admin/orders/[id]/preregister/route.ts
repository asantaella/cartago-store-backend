import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import PreregisterOrderService from "../../../../../services/preregister-order";


export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const  id  = req.params.id as string;


  try {
    // Resolver el servicio de pedidos

    const preregisterOrderService = req.scope.resolve<PreregisterOrderService>(
      "preregisterOrderService"
    );

    console.log("\n🚀 Correos preregister order:", id);

    const response = await preregisterOrderService.register(id as string);

    console.log("Response preregister:", response);

    const errors = response.shipments?.[0]?.error || [];

    if (!response || errors.length) {
      console.error(
        "Error validating preregister order with Correos:",
        response
      );
      return res.status(409).json([...errors]);
    }

    // Configurar headers CORS
    res.set({
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": `${process.env.ADMIN_CORS}`,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Requested-With",
    });

    // Devolver el DTO transformado
    return res.status(200).json(response);
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
