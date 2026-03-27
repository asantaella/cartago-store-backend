---
name: medusa-plugins
description: "Use when creating or updating MedusaJS v1.20.11 local plugins, especially payment processors, webhook routes, provider adapters, and plugin configuration compatibility in plugins/**."
argument-hint: "Plugin o provider a crear o modificar (ej: PayPal processor, webhook handler, tax provider)"
---

# MedusaJS Plugins v1.20.11

## Resultado

Modificar plugins locales de Medusa v1 sin romper contratos del core ni compatibilidad con flujos ya desplegados.

## Cuando usar esta skill

- Crear o cambiar un payment processor.
- Ajustar webhooks o callbacks de un plugin local.
- Revisar compatibilidad de opciones y adapters legacy.

## Proceso recomendado

1. Confirmar la abstraccion Medusa implicada (`AbstractPaymentProcessor`, `AbstractTaxService`, etc.).
2. Revisar como se registra el plugin en `medusa-config.js`.
3. Implementar o ajustar tipos de opciones y contextos.
4. Revisar webhooks, reintentos e idempotencia.
5. Verificar compatibilidad con servicios o subscribers consumidores.

## Patrones del repo

- `plugins/medusa-payment-paypal/src/services/paypal-provider.ts`
- `plugins/medusa-payment-paypal/src/api/routes/hooks/paypal.ts`

## Checklist

- Contrato de la abstraccion respetado.
- Tipos de opciones y estados claros.
- Compatibilidad legacy preservada cuando aplica.
- Riesgos de webhook/event ordering considerados.
