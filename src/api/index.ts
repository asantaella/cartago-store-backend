import { Router } from "express";
import cors from "cors";
import { sanitizeHandle } from "./middlewares/sanitize-handle";

export default function (rootDirectory: string, options: any) {
  const router = Router();

  // Configurar CORS
  router.use(cors());

  // Aplicar middleware de sanitización a rutas de productos
  router.use("/admin/products", sanitizeHandle);
  router.use("/store/products", sanitizeHandle);

  return router;
}
