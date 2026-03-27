---
name: medusa-services
description: "Use when creating or updating MedusaJS v1.20.11 services in src/services, including TransactionBaseService, dependency injection, repository access, atomicPhase, and withTransaction propagation."
argument-hint: "Servicio o caso de uso a implementar o refactorizar (ej: crear ProductAlertService o mover logica desde una API a un service)"
---

# MedusaJS Services v1.20.11

## Resultado

Crear o refactorizar servicios de `src/services/**` alineados con el patron real del repo.

## Cuando usar esta skill

- Crear un service nuevo de dominio.
- Mover logica desde un subscriber o API hacia `src/services/**`.
- Corregir transacciones, acceso a repositorios o dependencias entre servicios.

## Proceso recomendado

1. Confirmar si el caso requiere `TransactionBaseService`.
2. Identificar dependencias DI y repositorios implicados.
3. Implementar lectura con `this.activeManager_.withRepository(...)`.
4. Implementar escrituras con `atomicPhase_()` cuando haya varios pasos o side effects.
5. Propagar `withTransaction(transactionManager)` a servicios dependientes.
6. Dejar logs y errores orientados al dominio, no a HTTP.

## Patrones del repo

- `src/services/onboarding.ts`
- `src/services/algolia.ts`
- `src/services/preregister-order-validate.ts`

## Checklist

- Constructor alineado con el patron del archivo.
- Dependencias resueltas por DI.
- Repositorios usados via manager activo.
- Logica transaccional consistente.
- Sin logica HTTP ni detalles de evento mezclados en el servicio.
