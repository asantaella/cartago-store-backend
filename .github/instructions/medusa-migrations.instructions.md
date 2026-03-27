---
applyTo: "src/migrations/**/*.ts"
description: "Use when creating, updating, refactoring, or reviewing MedusaJS v1.20.11 migrations in src/migrations, including MigrationInterface, QueryRunner, reversible schema changes, and alignment with models."
---

# Medusa Migrations

## Reglas

- Implementa `MigrationInterface` con `up` y `down`.
- Mantén cada migration enfocada en un cambio de schema o backfill claramente relacionado.
- Prefiere cambios reversibles cuando sea razonable.
- Verifica que el schema resultante coincide con entidades y servicios afectados.
- Si introduces datos por defecto o backfills, deja claro por que son seguros e idempotentes.

## Patrones del repo

- Ejemplo base: `src/migrations/1685715079776-CreateOnboarding.ts`.
- Ejemplo de evolucion de schema: `src/migrations/1690996567455-CorrectOnboardingFields.ts`.
