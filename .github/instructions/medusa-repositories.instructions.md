---
applyTo: "src/repositories/**/*.ts"
description: "Use when creating, updating, refactoring, or reviewing MedusaJS v1.20.11 repositories in src/repositories, including dataSource.getRepository, transactional access through managers, and compatibility with services."
---

# Medusa Repositories

## Reglas

- Sigue el patron `dataSource.getRepository(Entity)` salvo necesidad clara de customizacion adicional.
- Deja la logica de negocio fuera del repositorio; coordinacion y reglas viven en servicios.
- Usa el repositorio a traves del manager activo dentro de servicios transaccionales.
- Mantén el repositorio alineado con el modelo y la migration correspondiente.

## Patron del repo

- Repositorio base: `src/repositories/onboarding.ts`.
