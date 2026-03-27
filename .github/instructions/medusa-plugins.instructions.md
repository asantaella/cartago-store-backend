---
applyTo: "plugins/**/*.ts"
description: "Use when creating, updating, refactoring, or reviewing MedusaJS v1.20.11 local plugins, including payment processors, webhook handlers, backward compatibility adapters, and plugin option typing."
---

# Medusa Plugins

## Objetivo

Extender Medusa v1 sin romper contratos internos ni integraciones ya desplegadas.

## Reglas

- Respeta los contratos de abstracciones como `AbstractPaymentProcessor`.
- Tipa opciones y contextos de integracion de forma explicita.
- Si el plugin contiene adaptadores legacy, preserva compatibilidad salvo que el cambio pida romperla.
- Revisa siempre el uso desde `medusa-config.js`, rutas webhook y servicios/subscribers dependientes.
- Trata webhooks y callbacks como potencialmente duplicados o fuera de orden.

## Patrones del repo

- Payment processor con adapters de compatibilidad: `plugins/medusa-payment-paypal/src/services/paypal-provider.ts`.
- Webhook route ligada al plugin: `plugins/medusa-payment-paypal/src/api/routes/hooks/paypal.ts`.
