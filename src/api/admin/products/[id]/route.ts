import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { sanitizeHandle } from "../../../middlewares/sanitize-handle";

interface ProductUpdateRequestBody {
  title?: string;
  handle?: string;
  [key: string]: any; // Allow additional properties
}

export const POST = async (
  req: MedusaRequest & { body: ProductUpdateRequestBody },
  res: MedusaResponse,
  next: Function
) => {
  // Aplicar el middleware sanitizeHandle
  sanitizeHandle(req as any, res as any, (err: any) => {
    if (err) {
      console.error("[SANITIZE-HANDLE] Error:", err);
      return next(err);
    }

    const { id } = req.params;

    try {
      const productService = req.scope.resolve("productService");
      console.log("[PRODUCTS] Actualizando producto:", {
        id,
        title: req.body.title,
        handle: req.body.handle,
      });

      // Verificar que el producto existe
      productService.retrieve(id).then(() => {
        // Actualizar el producto
        productService.update(id, req.body).then((product) => {
          console.log(
            "[PRODUCTS] Producto actualizado exitosamente:",
            product.id
          );
          res.json({ product });
        });
      });
    } catch (error) {
      console.error("[PRODUCTS] Error actualizando producto:", error);

      if (error.type === "not_found") {
        return res.status(404).json({
          error: "Producto no encontrado",
          message: `Producto con ID ${id} no existe`,
        });
      }

      if (error.type === "duplicate_error") {
        return res.status(409).json({
          error: "Handle duplicado",
          message: "Ya existe un producto con ese handle",
        });
      }

      next(error); // Pasar el error al middleware de manejo de errores
    }
  });
};
