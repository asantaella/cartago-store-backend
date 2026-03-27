---
name: medusa-subscribers
description: "Use when creating or updating MedusaJS v1.20.11 subscribers in src/subscribers, including typed SubscriberArgs payloads, official event names, context.subscriberId, and service resolution through container.resolve."
argument-hint: "Evento y objetivo del subscriber (ej: shipment.created para enviar notificacion)"
---

# MedusaJS Subscribers v1.20.11

## Resultado

Crear subscribers consistentes con Medusa v1.20.11 que:

- Escuchen eventos oficiales (`order.placed`, `payment.captured`, `shipment.created`, etc.).
- Usen handler tipado con `SubscriberArgs<TPayload>`.
- Resuelvan dependencias por DI (`container.resolve`).
- Exporten `config` con `event` y `context.subscriberId` estable.
- Mantengan el bus no bloqueante (errores controlados, side effects delegados a servicios).

## Cuando usar esta skill

- Crear un subscriber nuevo en `src/subscribers/**`.
- Migrar subscribers existentes a la firma moderna (v1.18+ y vigente en v1.20.11).
- Estandarizar eventos y naming (`subscriberId`, logs, payload type).
- Implementar automatizaciones por eventos (emails, sincronizaciones, notificaciones, webhooks).
- Revisar subscribers en conjunto con servicios o APIs cuando el flujo involucra varias capas.

## Proceso recomendado

1. Definir el evento y el payload esperado.
2. Crear archivo en `src/subscribers/<dominio>-<evento>.ts`.
3. Implementar handler por defecto con `SubscriberArgs<TPayload>`.
4. Resolver servicios con `container.resolve("...")`.
5. Recuperar entidades con relaciones necesarias para el caso de uso.
6. Ejecutar side effects en servicios de dominio (no meter toda la logica en el subscriber).
7. Manejar errores con `try/catch` y logs claros.
8. Exportar `config` con `event` y `context.subscriberId`.
9. Verificar idempotencia ante reintentos del event bus.

## Puntos de decision

- Evento unico vs multiple:
  - Si una sola accion aplica a varios eventos, usar `event: [event1, event2]` y ramificar con `eventName`.
- Constante de servicio vs string literal:
  - Preferir `OrderService.Events.SHIPMENT_CREATED` o equivalente del servicio antes que strings sueltos.
- Datos insuficientes en `data`:
  - Recuperar entidad por `id` o `fulfillment_id` y ampliar `relations` segun lo que use el servicio downstream.
- Event bus local en desarrollo:
  - `eventName` puede venir `undefined` y `subscriberId` en `context` puede no respetarse en `event-bus-local`.
  - En produccion usar Redis Event Module para comportamiento consistente.
- Logica en subscriber vs service:
  - Si la implementacion requiere reglas de negocio, persistencia o reuso, mover el trabajo a `src/services/**` y dejar el subscriber como orquestador.

## Criterios de calidad

- El handler exportado es `default async function`.
- `config` es de tipo `SubscriberConfig` y tiene `event` + `context.subscriberId`.
- No se instancian servicios manualmente; solo DI container.
- Se evita acceso directo a queries crudas salvo casos justificados.
- Se registran logs de inicio, exito y error con IDs relevantes.
- El subscriber orquesta efectos secundarios; la logica compleja vive en `src/services/**`.
- Si se recuperan entidades, las `relations` incluidas son exactamente las necesarias para el servicio downstream.

Checklist completa: [Subscriber Quality Checklist](./references/subscriber-checklist.md)

## Plantilla base

Usa la plantilla lista para copiar:

- [Subscriber Template](./references/subscriber-template.md)

## Ejemplo aplicado: shipment.created

Referencia: `src/subscribers/shipment-created.ts`

Patron detallado del ejemplo:

- [Shipment Created Pattern](./references/shipment-created-pattern.md)

## Caveats Event Bus

- [Event Bus Caveats](./references/event-bus-caveats.md)

## Prompt sugerido para invocar la skill

- "Crea un subscriber para `order.placed` que envie email de confirmacion."
- "Refactoriza este subscriber para usar `SubscriberArgs` tipado y `subscriberId` estable."
- "Genera un subscriber `payment.captured` con idempotencia y logs de reintento."

## Referencias

- https://docs.medusajs.com/v1/development/events/subscribers
- https://docs.medusajs.com/v1/development/events/create-subscriber
- Patrones del repo: `src/subscribers/payment-captured.ts`, `src/subscribers/order-placed-sepa.ts`, `src/subscribers/paypal-payment-capture.ts`
