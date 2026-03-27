---
applyTo: "src/api/**/*.ts"
description: "Use when creating, updating, refactoring, or reviewing MedusaJS v1.20.11 custom API routes in src/api, including MedusaRequest, MedusaResponse, req.scope.resolve, and transaction coordination."
---

# Medusa Custom APIs

## Objetivo

Mantener rutas custom store/admin finas, seguras y consistentes con DI y transacciones de Medusa.

## Reglas

- Usa `MedusaRequest` y `MedusaResponse`.
- Resuelve dependencias con `req.scope.resolve(...)`.
- Si coordinas varias escrituras, usa `manager.transaction(...)` y propaga `withTransaction(...)`.
- Mantén la validacion y la adaptacion HTTP en la ruta; la logica de dominio vive en servicios.
- Devuelve codigos de estado y payloads coherentes con la accion realizada.
- Al usar `retrieveWithTotals(...)`, incluye relaciones suficientes para el response o el servicio downstream.

## Patrones del repo

- Ruta admin con transaccion y servicio custom: `src/api/admin/onboarding/route.ts`.
- Ruta store con cart y totales: `src/api/store/shipping-options/[cart_id]/route.ts`.
- Ruta admin con recalculo de ordenes y manejo de relaciones: `src/api/admin/orders/route.ts`.

## Evita

- Hacer logica compleja de negocio directamente en el handler.
- Acceder a repositorios sin pasar por servicios salvo casos de infraestructura muy acotados.
