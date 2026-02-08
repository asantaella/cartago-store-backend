import { Router, Router as ExpressRouter } from "express";
import { sanitizeHandle } from "../../middlewares/sanitize-handle";

const router: ExpressRouter = Router();

// Middleware para validar datos del producto

// Ruta para crear producto
router.post("/", sanitizeHandle, async (req, res, next) => {
  try {
    const productService = req.scope.resolve("productService");
    console.log("[PRODUCTS] Creando producto:", {
      title: req.body.title,
      handle: req.body.handle,
    });
    const product = await productService.create(req.body);
    console.log("[PRODUCTS] Producto creado exitosamente:", product.id);
    res.status(201).json({ product });
  } catch (error) {
    console.error("[PRODUCTS] Error creando producto:", error);
    if (error.type === "duplicate_error") {
      return res.status(409).json({
        error: "Producto duplicado",
        message: "Ya existe un producto con ese handle",
      });
    }
    next(error);
  }
});

// Ruta para actualizar producto
router.post("/:id", sanitizeHandle, async (req, res, next) => {
  try {
    const productService = req.scope.resolve("productService");
    const { id } = req.params;
    console.log("[PRODUCTS] Actualizando producto:", {
      id,
      title: req.body.title,
      handle: req.body.handle,
    });
    // Verificar que el producto existe
    await productService.retrieve(id);
    const product = await productService.update(id, req.body);
    console.log("[PRODUCTS] Producto actualizado exitosamente:", product.id);
    res.json({ product });
  } catch (error) {
    console.error("[PRODUCTS] Error actualizando producto:", error);
    if (error.type === "not_found") {
      return res.status(404).json({
        error: "Producto no encontrado",
        message: `Producto con ID ${req.params.id} no existe`,
      });
    }
    if (error.type === "duplicate_error") {
      return res.status(409).json({
        error: "Handle duplicado",
        message: "Ya existe un producto con ese handle",
      });
    }
    next(error);
  }
});

export function attachProductRoutes(adminRouter: Router) {
  // Se aplica el middleware de sanitización y las rutas creadas
  adminRouter.use("/products", sanitizeHandle);
  adminRouter.use("/products", router);
}

export default router;
