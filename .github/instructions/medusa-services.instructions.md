---
applyTo: "src/services/**/*.ts"
description: "Use when creating, updating, refactoring, or reviewing MedusaJS v1.20.11 services in src/services, including TransactionBaseService, repository access, withTransaction propagation, and service orchestration."
---

# Medusa Services

## Objetivo

Mantener servicios consistentes con la arquitectura Medusa v1 del repositorio.

## Reglas

- Prefiere `TransactionBaseService` para modulos de dominio con persistencia o coordinacion entre dependencias.
- Mantén las dependencias como propiedades protegidas con sufijo `_` cuando el archivo ya siga ese estilo.
- Usa repositorios a traves de `this.activeManager_.withRepository(...)` o `transactionManager.withRepository(...)`.
- Si llamas a otro servicio dentro de una transaccion, usa `otherService.withTransaction(transactionManager)`.
- Usa `atomicPhase_()` para secuencias de escritura con mas de un paso o con posibilidad de fallo parcial.
- Deja los side effects y la coordinacion aqui; no los empujes a subscribers o rutas.
- Si el servicio depende de env vars, habilitalo de forma explicita y falla con logs claros cuando falten precondiciones.

## Patrones del repo

- Patron simple de servicio transaccional: `src/services/onboarding.ts`.
- Patron de servicio que recupera entidades con relaciones: `src/services/invoice-pdf-generator.ts`.
- Patron de integracion externa con feature flag por env vars: `src/services/algolia.ts`.

## Evita

- Instanciar repositorios o servicios manualmente.
- Meter logica HTTP o formateo de respuestas de API aqui.
- Saltarte la transaccion al encadenar servicios dependientes.
