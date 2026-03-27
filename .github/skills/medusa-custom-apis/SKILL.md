---
name: medusa-custom-apis
description: "Use when creating or updating MedusaJS v1.20.11 custom APIs in src/api, including MedusaRequest, MedusaResponse, req.scope.resolve, manager.transaction, and delegation to services."
argument-hint: "Ruta o endpoint a crear o modificar (ej: admin/products POST, store/order invoice GET)"
---

# MedusaJS Custom APIs v1.20.11

## Resultado

Crear rutas custom de `src/api/**` que actuan como orquestadores finos sobre servicios de dominio.

## Cuando usar esta skill

- Crear una ruta store o admin.
- Refactorizar una ruta con demasiada logica.
- Corregir manejo de transacciones o DI en handlers HTTP.

## Proceso recomendado

1. Definir el contrato HTTP: metodo, params, body y respuesta.
2. Resolver servicios con `req.scope.resolve(...)`.
3. Validar si hace falta `manager.transaction(...)`.
4. Delegar la logica principal a un servicio.
5. Devolver respuesta pequena y estable.

## Patrones del repo

- `src/api/admin/onboarding/route.ts`
- `src/api/store/shipping-options/[cart_id]/route.ts`
- `src/api/admin/orders/route.ts`

## Checklist

- Usa `MedusaRequest` y `MedusaResponse`.
- Usa DI desde `req.scope`.
- No contiene logica de dominio extensa.
- Codigos de estado y payload coherentes.
