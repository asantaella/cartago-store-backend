---
applyTo: "src/models/**/*.ts"
description: "Use when creating, updating, refactoring, or reviewing MedusaJS v1.20.11 models in src/models, including BaseEntity usage, TypeORM decorators, and schema compatibility with repositories and migrations."
---

# Medusa Models

## Reglas

- Usa entidades TypeORM simples y legibles.
- Hereda de `BaseEntity` de Medusa cuando el modelo siga el patron del repo.
- Declara columnas y relaciones con decoradores TypeORM sin sobreingenieria.
- Alinea nullability, defaults y naming con las migraciones reales.
- Si agregas relaciones, revisa el impacto en servicios que cargan `relations` explicitamente.

## Patrones del repo

- Entidad simple con `BaseEntity`: `src/models/onboarding.ts`.
- Entidad de dominio adicional: `src/models/product-alert-subscription.ts`.
