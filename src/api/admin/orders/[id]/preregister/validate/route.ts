import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";

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
  const preregisterOrderValidateService = req.scope.resolve(
    "preregisterOrderValidateService"
  );
  try {
    const response = await preregisterOrderValidateService.validate(id);
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
