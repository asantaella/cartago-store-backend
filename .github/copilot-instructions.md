# MedusaJS v1.20.11 Backend Instructions

Este repositorio es un backend de MedusaJS v1.20.11 con TypeScript, TypeORM, subscribers, custom APIs y plugins locales. Cuando trabajes aqui, prioriza los patrones reales del proyecto sobre recetas genericas de Node o de Medusa v2.

## Stack y limites

- Usa patrones de Medusa v1.20.x, no APIs ni arquitectura de Medusa v2.
- Mantente dentro del stack actual: TypeScript, TypeORM, servicios Medusa, rutas `src/api`, subscribers `src/subscribers`, plugins locales en `plugins/**`.
- No introduzcas Prisma, Drizzle, CQRS ni capas nuevas salvo que se pidan expresamente.
- Conserva el estilo del repositorio, incluido el uso mixto de ingles y espanol en modulos ya existentes.

## Buenas practicas TypeScript

- Tipa explicitamente los bordes del sistema: handlers HTTP, subscribers, servicios publicos, payloads, DTOs y retornos publicos.
- No fuerces una migracion artificial a `strict: true`; endurece tipos solo en el codigo que toques.
- Evita `any` cuando el shape sea conocido. Si el payload es parcial o incierto, usa un tipo pequeno y explicito o `Record<string, unknown>` y refinalo.
- Usa nombres descriptivos y evita logica implita basada en casting o coercion.
- Prefiere utilidades y tipos ya presentes en Medusa antes que reimplementar tipos genericos propios.

## Arquitectura por capas

- `src/api/**`: recibe y valida entrada, resuelve dependencias desde `req.scope`, coordina transacciones y delega la logica real a servicios.
- `src/services/**`: contiene logica de negocio, coordinacion entre repositorios y side effects de dominio.
- `src/subscribers/**`: orquesta reacciones a eventos. Debe ser fino, idempotente y delegar trabajo pesado a servicios.
- `src/models/**` y `src/repositories/**`: representan persistencia TypeORM. Mantenlos simples y alineados con el schema.
- `src/migrations/**`: cambia schema y datos de forma reversible y conservadora.
- `plugins/**`: extiende contratos de Medusa v1 sin romper compatibilidad ni firmas esperadas por core.

## Servicios Medusa

- Si el modulo persiste datos o coordina operaciones de dominio, prefiere `TransactionBaseService`.
- Usa `super(container)` o `super(arguments[0])` segun el patron existente del archivo.
- Resuelve dependencias por DI; no instancies servicios manualmente.
- Para acceso a repositorios, usa `this.activeManager_.withRepository(...)` fuera de transacciones y `transactionManager.withRepository(...)` dentro de `atomicPhase_()`.
- Si un servicio llama a otro dentro de una transaccion, propaga `withTransaction(transactionManager)`.
- No dupliques logica de negocio entre rutas, subscribers y servicios.

## APIs custom

- Usa `MedusaRequest` y `MedusaResponse` en `src/api/**`.
- Resuelve servicios con `req.scope.resolve("serviceName")`.
- Si una ruta hace varias escrituras o coordina varios servicios, usa `manager.transaction(...)`.
- No metas consultas SQL crudas en handlers salvo que el caso lo requiera claramente.
- Devuelve respuestas HTTP coherentes y payloads pequenos y predecibles.

## Subscribers

- Usa `SubscriberArgs<TPayload>` y `SubscriberConfig`.
- Prefiere constantes de eventos como `OrderService.Events.PAYMENT_CAPTURED` antes que strings sueltos.
- Declara siempre `context.subscriberId` estable.
- Recupera entidades con las relaciones realmente necesarias antes de delegar a servicios.
- Considera idempotencia, reintentos y carreras de eventos, especialmente en pagos y webhooks.

## Persistencia y migraciones

- En entidades, usa `BaseEntity` de Medusa cuando aplique y decoradores TypeORM simples.
- En repositorios custom, sigue el patron `dataSource.getRepository(Entity)`.
- En migraciones, implementa `up` y `down` con cambios reversibles cuando sea razonable.
- Evita mezclar cambios de schema no relacionados en una sola migration.

## Plugins locales

- Respeta contratos de `AbstractPaymentProcessor`, `AbstractTaxService` u otras abstracciones de Medusa v1.
- Ten cuidado con compatibilidad retroactiva cuando el plugin ya contiene adapters legacy.
- No cambies firmas publicas de plugins sin revisar su uso desde `medusa-config.js` y consumidores internos.

## Riesgos concretos del repo

- Hay riesgo de carreras e idempotencia en webhooks y captura de pagos de PayPal.
- Hay logica de pricing/tax sensible a middleware y direccion de envio; evita duplicar ajustes.
- Hay servicios que dependen de variables de entorno para habilitar funcionalidades; no asumas que siempre existen.
- Hay flows donde `retrieveWithTotals(...)` y las `relations` correctas son criticas para evitar datos incompletos.

## Regla operativa

Cuando generes o modifiques codigo en este backend, primero identifica la capa correcta. Si dudas entre API, subscriber o service, mueve la logica hacia `src/services/**` y deja API/subscriber como orquestadores finos.
