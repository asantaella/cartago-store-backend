import { Request, Response, NextFunction } from "express";

export function sanitizeHandle(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Solo procesar en operaciones de creación y actualización
    if (!["POST", "PUT", "PATCH"].includes(req.method)) {
      return next();
    }

    // Verificar que req.body existe y es un objeto
    if (!req.body || typeof req.body !== "object") {
      return next();
    }

    // Verificar que la URL corresponde a productos
    if (!req.path.includes("/products")) {
      return next();
    }

    let handleModified = false;

    // Solo procesar si hay un handle en el body
    if (req.body.handle && typeof req.body.handle === "string") {
      console.log("[SANITIZE-HANDLE] Sanitizing handle:", req.body.handle);
      const sanitizedHandle = sanitizeHandleString(req.body.handle);

      if (sanitizedHandle !== req.body.handle) {
        req.body.handle = sanitizedHandle;
        handleModified = true;
        console.log("[SANITIZE-HANDLE] Handle sanitizado:", req.body.handle);
      }
    }

    // Si no hay handle pero hay título, generar handle a partir del título
    if (
      !req.body.handle &&
      req.body.title &&
      typeof req.body.title === "string"
    ) {
      console.log(
        "[SANITIZE-HANDLE] Generating handle from title:",
        req.body.title
      );
      req.body.handle = sanitizeHandleString(req.body.title);
      handleModified = true;
      console.log("[SANITIZE-HANDLE] Handle generado:", req.body.handle);
    }

    if (handleModified) {
      console.log("[SANITIZE-HANDLE] Handle procesado correctamente");
    }

    next();
  } catch (error) {
    console.error("[SANITIZE-HANDLE] Error sanitizando handle:", error);
    next(error);
  }
}

function sanitizeHandleString(input: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  return (
    input
      .toLowerCase()
      // Reemplazar tildes y caracteres especiales
      .replace(/[áàäâã]/g, "a")
      .replace(/[éèëê]/g, "e")
      .replace(/[íìïî]/g, "i")
      .replace(/[óòöôõ]/g, "o")
      .replace(/[úùüû]/g, "u")
      .replace(/[ñ]/g, "n")
      .replace(/[ç]/g, "c")
      // Eliminar caracteres no alfanuméricos (excepto espacios y guiones)
      .replace(/[^a-z0-9\s-]/g, "")
      // Reemplazar espacios múltiples por uno solo
      .replace(/\s+/g, " ")
      // Trim espacios al inicio y final
      .trim()
      // Reemplazar espacios por guiones
      .replace(/\s/g, "-")
      // Reemplazar múltiples guiones por uno solo
      .replace(/-+/g, "-")
      // Eliminar guiones al inicio y final
      .replace(/^-+|-+$/g, "")
  );
}
