---
applyTo: "src/subscribers/**/*.ts"
description: "Use when creating, updating, refactoring, or reviewing MedusaJS v1.20.11 subscribers in src/subscribers, including SubscriberArgs payload typing, container.resolve, official event names, and context.subscriberId."
---

# Medusa Subscribers

## Objetivo

Mantener subscribers pequenos, tipados e idempotentes, alineados con el bus de eventos de Medusa v1.

## Reglas

- Usa `default async function` con `SubscriberArgs<TPayload>`.
- Exporta `config` tipado como `SubscriberConfig`.
- Declara `context.subscriberId` estable y legible.
- Prefiere constantes de eventos del servicio correspondiente antes que strings literales.
- Resuelve servicios con `container.resolve("...")`.
- Recupera entidades con relaciones suficientes antes de delegar a servicios.
- Encapsula el trabajo pesado y reusable en servicios de `src/services/**`.
- Maneja errores con logs claros e idempotencia suficiente para reintentos.

## Patrones del repo

- Coordinacion de multiples servicios: `src/subscribers/payment-captured.ts`.
- Recuperacion de orden con totales: `src/subscribers/order-placed-sepa.ts`.
- Integracion con servicios externos y reintentos: `src/subscribers/paypal-payment-capture.ts`.

## Skill relacionada

- Usa tambien la skill `medusa-subscribers` para creacion guiada, plantillas y checklist.
