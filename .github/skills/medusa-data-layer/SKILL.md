---
name: medusa-data-layer
description: "Use when creating or updating MedusaJS v1.20.11 models, repositories, or migrations, including BaseEntity entities, dataSource.getRepository, MigrationInterface, and schema alignment across the data layer."
argument-hint: "Entidad, repositorio o migration a crear o modificar (ej: ProductAlertSubscription model + migration)"
---

# MedusaJS Data Layer v1.20.11

## Resultado

Crear cambios coherentes en `src/models/**`, `src/repositories/**` y `src/migrations/**` sin romper compatibilidad con servicios y TypeORM.

## Cuando usar esta skill

- Crear una entidad custom.
- Añadir un repositorio asociado.
- Crear o corregir una migration.
- Alinear el schema con cambios del dominio.

## Proceso recomendado

1. Diseñar primero la entidad y su nullability.
2. Crear el repositorio con `dataSource.getRepository(...)`.
3. Escribir migration con `up` y `down`.
4. Revisar servicios y rutas que necesiten nuevas `relations` o campos.

## Patrones del repo

- `src/models/onboarding.ts`
- `src/repositories/onboarding.ts`
- `src/migrations/1685715079776-CreateOnboarding.ts`

## Checklist

- Modelo, repositorio y migration alineados.
- Tipos de columnas y defaults consistentes.
- Migration reversible cuando sea razonable.
- Sin logica de negocio escondida en el repositorio.
