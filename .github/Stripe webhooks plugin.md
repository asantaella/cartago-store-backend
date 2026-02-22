<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Documentación de Webhooks en MedusaJS v1.20.11 - Formato Optimizado para Claude 4.5

## Resumen Ejecutivo

MedusaJS v1.20+ maneja webhooks de pago a través de un sistema basado en Event Bus que procesa eventos de terceros (como Stripe) de forma asíncrona. El webhook `payment_intent.succeeded` de Stripe se recibe en una ruta API dedicada y se procesa mediante subscribers que escuchan eventos internos de Medusa.[^1][^2][^3]

## Arquitectura de Webhooks en MedusaJS v1.20.11

### Flujo de Procesamiento de Webhooks

1. **Recepción**: Stripe envía POST a `/hooks/payment/[identifier]_[provider]`[^4][^3]
2. **Validación**: La ruta API valida la firma del webhook de Stripe[^5]
3. **Event Bus**: El evento se publica en el Event Bus con retorno inmediato 200[^1]
4. **Procesamiento Asíncrono**: Un subscriber escucha el evento y ejecuta la lógica de negocio[^6][^1]
5. **Delay Configurable**: Por defecto, hay un delay de 5 segundos para evitar race conditions[^1]

### Componentes Principales

```
┌─────────────────┐
│  Stripe Webhook │
└────────┬────────┘
         │ POST /hooks/payment/stripe_stripe
         ▼
┌─────────────────────────────────┐
│  Webhook Listener API Route     │ → Retorna 200 inmediatamente
│  (Built-in MedusaJS)            │
└────────┬────────────────────────┘
         │ Publica evento interno
         ▼
┌─────────────────────────────────┐
│      Event Bus Service          │
│  (Redis recomendado prod)       │
└────────┬────────────────────────┘
         │ Delay 5s (configurable)
         ▼
┌─────────────────────────────────┐
│   Custom Subscriber Handler     │
│   (src/subscribers/)            │
└─────────────────────────────────┘
```


## Configuración de la Ruta de Webhook

### URL del Webhook para Stripe

La ruta de webhook en MedusaJS sigue el patrón:

```
POST /hooks/payment/{identifier}_{provider}
```

Para el Stripe Module Provider básico:

```
https://your-server.com/hooks/payment/stripe_stripe
```

Donde:

- `identifier`: Propiedad estática `identifier` del proveedor de pago (ej: `stripe`)
- `provider`: ID del proveedor (ej: `stripe`)


### Eventos de Stripe Requeridos

Al configurar el webhook en el Dashboard de Stripe, selecciona estos eventos:

- `payment_intent.amount_capturable_updated`
- `payment_intent.succeeded` ← **Evento principal para pagos exitosos**
- `payment_intent.payment_failed`
- `payment_intent.partially_funded` (desde v2.8.5)

[^4]

### Configuración del Plugin de Stripe

En `medusa-config.ts`:

```typescript
import { loadEnv, Modules } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = {
  projectConfig: {
    // ... otras configuraciones
  },
  plugins: [
    {
      resolve: "medusa-payment-stripe",
      options: {
        apiKey: process.env.STRIPE_API_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        // Opcional: configurar delay de procesamiento
        webhookDelay: 5000, // milisegundos (default: 5000)
      },
    },
  ],
  modules: {
    // Event Bus Module (REQUERIDO para webhooks)
    [Modules.EVENT_BUS]: {
      resolve: "@medusajs/event-bus-redis",
      options: {
        redisUrl: process.env.REDIS_URL,
      },
    },
  },
}
```

**Importante**: Desde la versión 6.0.7 del plugin de Stripe, el **Event Bus Service es obligatorio**.[^1]

### Variables de Entorno

```bash
# .env
STRIPE_API_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
REDIS_URL=redis://localhost:6379
```


## Implementación de Subscriber para `payment_intent.succeeded`

### Estructura Básica del Subscriber

Crea el archivo `src/subscribers/payment-intent-succeeded.ts`:

```typescript
import { 
  SubscriberArgs, 
  SubscriberConfig 
} from "@medusajs/medusa"
import { Logger } from "@medusajs/medusa"

export const config: SubscriberConfig = {
  event: "payment.captured", // Evento interno de Medusa
  context: {
    subscriberId: "payment-intent-succeeded-handler",
  },
}

export default async function handlePaymentIntentSucceeded({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger: Logger = container.resolve("logger")
  const paymentId = event.data.id
  
  logger.info(`Payment captured: ${paymentId}`)
  
  try {
    // Tu lógica de negocio aquí
    await processSuccessfulPayment(paymentId, container)
  } catch (error) {
    logger.error(`Error processing payment ${paymentId}:`, error)
    throw error // El Event Bus reintentará
  }
}

async function processSuccessfulPayment(
  paymentId: string, 
  container: any
) {
  // Implementación específica
}
```


### Mapeo de Eventos Stripe → MedusaJS

Cuando Stripe envía `payment_intent.succeeded`, MedusaJS lo procesa mediante `getWebhookActionAndData` y emite internamente:


| Evento Stripe | Acción Detectada | Evento Medusa Interno |
| :-- | :-- | :-- |
| `payment_intent.succeeded` | `captured` | `payment.captured` |
| `payment_intent.succeeded` | `authorized` | `payment.authorized` |
| `payment_intent.payment_failed` | N/A | `payment.failed` |

[^19]

### Ejemplo Completo: Crear Orden Después de Pago Exitoso

```typescript
import { 
  SubscriberArgs, 
  SubscriberConfig 
} from "@medusajs/medusa"
import { 
  Logger,
  PaymentService,
  CartService,
  OrderService,
} from "@medusajs/medusa"

export const config: SubscriberConfig = {
  event: "payment.captured",
  context: {
    subscriberId: "complete-order-on-payment-success",
  },
}

export default async function completeOrderOnPayment({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger: Logger = container.resolve("logger")
  const paymentService: PaymentService = container.resolve("paymentService")
  const cartService: CartService = container.resolve("cartService")
  const orderService: OrderService = container.resolve("orderService")
  
  const paymentId = event.data.id
  
  try {
    logger.info(`[Payment Webhook] Processing payment: ${paymentId}`)
    
    // 1. Obtener el pago
    const payment = await paymentService.retrieve(paymentId, {
      relations: ["cart", "order"],
    })
    
    // 2. Verificar si ya existe una orden
    if (payment.order_id) {
      logger.info(`[Payment Webhook] Order already exists: ${payment.order_id}`)
      return
    }
    
    // 3. Verificar si hay un cart asociado
    if (!payment.cart_id) {
      logger.warn(`[Payment Webhook] No cart associated with payment: ${paymentId}`)
      return
    }
    
    // 4. Obtener el cart
    const cart = await cartService.retrieve(payment.cart_id, {
      relations: ["payment_sessions", "customer"],
    })
    
    // 5. Verificar que el cart no esté completado
    if (cart.completed_at) {
      logger.info(`[Payment Webhook] Cart already completed: ${cart.id}`)
      return
    }
    
    // 6. Completar el cart y crear la orden
    const order = await cartService.createOrder(cart.id)
    
    logger.info(`[Payment Webhook] Order created successfully: ${order.id}`)
    
    // 7. (Opcional) Ejecutar workflows adicionales
    // Por ejemplo, enviar email de confirmación
    // await sendOrderConfirmationWorkflow.run({
    //   input: { order_id: order.id }
    // })
    
  } catch (error) {
    logger.error(`[Payment Webhook] Error processing payment ${paymentId}:`, error)
    // El error hará que el Event Bus reintente
    throw error
  }
}
```


### Ejemplo: Logging y Notificaciones

```typescript
import { 
  SubscriberArgs, 
  SubscriberConfig 
} from "@medusajs/medusa"
import { Logger } from "@medusajs/medusa"

export const config: SubscriberConfig = {
  event: "payment.captured",
  context: {
    subscriberId: "payment-captured-logger",
  },
}

export default async function logPaymentCaptured({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger: Logger = container.resolve("logger")
  const paymentService = container.resolve("paymentService")
  
  try {
    const payment = await paymentService.retrieve(event.data.id, {
      relations: ["cart", "cart.customer"],
    })
    
    const customerEmail = payment.cart?.customer?.email || "unknown"
    const amount = payment.amount / 100 // Convertir de centavos
    const currency = payment.currency_code.toUpperCase()
    
    logger.info({
      event: "payment_captured",
      payment_id: payment.id,
      customer_email: customerEmail,
      amount: `${amount} ${currency}`,
      timestamp: new Date().toISOString(),
    })
    
    // (Opcional) Enviar notificación a sistema externo
    // await notificationService.send({
    //   to: customerEmail,
    //   template: "payment_confirmation",
    //   data: { amount, currency }
    // })
    
  } catch (error) {
    logger.error("Error logging payment capture:", error)
  }
}
```


### Ejemplo: Integración con Sistema Externo

```typescript
import { 
  SubscriberArgs, 
  SubscriberConfig 
} from "@medusajs/medusa"
import { Logger } from "@medusajs/medusa"
import axios from "axios"

interface PaymentCapturedData {
  id: string
}

export const config: SubscriberConfig = {
  event: "payment.captured",
  context: {
    subscriberId: "sync-payment-to-erp",
  },
}

export default async function syncPaymentToERP({
  event,
  container,
}: SubscriberArgs<PaymentCapturedData>) {
  const logger: Logger = container.resolve("logger")
  const paymentService = container.resolve("paymentService")
  
  const paymentId = event.data.id
  
  try {
    // Obtener detalles completos del pago
    const payment = await paymentService.retrieve(paymentId, {
      relations: [
        "cart",
        "cart.customer",
        "cart.items",
        "cart.items.variant",
        "cart.items.variant.product",
      ],
    })
    
    // Preparar payload para sistema ERP
    const erpPayload = {
      payment_id: payment.id,
      external_id: payment.data?.stripe_payment_intent_id || null,
      amount: payment.amount,
      currency: payment.currency_code,
      customer: {
        id: payment.cart?.customer?.id,
        email: payment.cart?.customer?.email,
      },
      items: payment.cart?.items?.map(item => ({
        sku: item.variant?.sku,
        title: item.variant?.product?.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
      })),
      captured_at: payment.captured_at,
    }
    
    // Enviar a ERP
    const response = await axios.post(
      process.env.ERP_WEBHOOK_URL || "",
      erpPayload,
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.ERP_API_KEY}`,
        },
        timeout: 5000,
      }
    )
    
    logger.info(`[ERP Sync] Payment synced successfully: ${paymentId}`, {
      erp_transaction_id: response.data.transaction_id,
    })
    
  } catch (error) {
    logger.error(`[ERP Sync] Failed to sync payment ${paymentId}:`, error)
    
    // Implementar retry logic o dead letter queue
    if (axios.isAxiosError(error) && error.response?.status >= 500) {
      // Error del servidor ERP - reintentar
      throw error
    }
    
    // Error de cliente (4xx) - no reintentar, solo loguear
    logger.warn(`[ERP Sync] Client error, will not retry: ${error}`)
  }
}
```


## Manejo Avanzado de Webhooks

### Idempotencia: Evitar Procesamiento Duplicado

```typescript
import { 
  SubscriberArgs, 
  SubscriberConfig 
} from "@medusajs/medusa"
import { Logger } from "@medusajs/medusa"

// Usar Redis o base de datos para tracking
const processedEvents = new Set<string>()

export const config: SubscriberConfig = {
  event: "payment.captured",
  context: {
    subscriberId: "idempotent-payment-handler",
  },
}

export default async function idempotentPaymentHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger: Logger = container.resolve("logger")
  const paymentId = event.data.id
  
  // Verificar si ya procesamos este evento
  if (processedEvents.has(paymentId)) {
    logger.info(`[Idempotency] Payment already processed: ${paymentId}`)
    return
  }
  
  try {
    // Procesar el pago
    await processPayment(paymentId, container)
    
    // Marcar como procesado
    processedEvents.add(paymentId)
    
    // En producción, usar Redis con TTL
    // await redisClient.setex(`processed:payment:${paymentId}`, 86400, "1")
    
  } catch (error) {
    logger.error(`[Payment Handler] Error: ${error}`)
    throw error
  }
}

async function processPayment(paymentId: string, container: any) {
  // Lógica de procesamiento
}
```


### Manejo de Eventos Fuera de Orden

```typescript
import { 
  SubscriberArgs, 
  SubscriberConfig 
} from "@medusajs/medusa"
import { Logger, PaymentService } from "@medusajs/medusa"

export const config: SubscriberConfig = {
  event: "payment.captured",
  context: {
    subscriberId: "order-aware-payment-handler",
  },
}

export default async function orderAwarePaymentHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger: Logger = container.resolve("logger")
  const paymentService: PaymentService = container.resolve("paymentService")
  
  const paymentId = event.data.id
  
  try {
    // Siempre obtener el estado más reciente desde la API
    const payment = await paymentService.retrieve(paymentId, {
      relations: ["cart", "order"],
    })
    
    // Verificar estado actual, no confiar en el orden de eventos
    if (payment.order_id) {
      logger.info(`Order already exists for payment: ${paymentId}`)
      return
    }
    
    if (!payment.captured_at) {
      logger.warn(`Payment not actually captured yet: ${paymentId}`)
      return
    }
    
    // Procesar basándose en estado actual
    await createOrderFromPayment(payment, container)
    
  } catch (error) {
    logger.error(`Error handling payment: ${error}`)
    throw error
  }
}

async function createOrderFromPayment(payment: any, container: any) {
  // Implementación
}
```


### Verificación de Firma de Webhook (Custom Handler)

Si necesitas validar el webhook manualmente (ej: en una ruta API custom):

```typescript
import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_API_KEY!, {
  apiVersion: "2023-10-16",
})

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const sig = req.headers["stripe-signature"] as string
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!
  
  let event: Stripe.Event
  
  try {
    // Construir evento y verificar firma
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      webhookSecret
    )
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err}`)
    return res.status(400).json({ 
      error: "Invalid signature" 
    })
  }
  
  // Manejar el evento
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent
    
    // Procesar el evento
    console.log(`Payment succeeded: ${paymentIntent.id}`)
    
    // Publicar en Event Bus interno de Medusa
    const eventBusService = req.scope.resolve("eventBusService")
    await eventBusService.emit("payment.custom.succeeded", {
      payment_intent_id: paymentIntent.id,
    })
  }
  
  // Retornar 200 inmediatamente
  res.status(200).json({ received: true })
}
```


## Configuración del Event Bus para Producción

### Instalación de Redis Event Bus

```bash
npm install @medusajs/event-bus-redis
# o
yarn add @medusajs/event-bus-redis
```


### Configuración en `medusa-config.ts`

```typescript
import { Modules } from "@medusajs/framework/utils"

module.exports = {
  projectConfig: {
    // ...
  },
  modules: {
    [Modules.EVENT_BUS]: {
      resolve: "@medusajs/event-bus-redis",
      options: {
        redisUrl: process.env.REDIS_URL,
        // Opcional: configuración adicional
        redisOptions: {
          retryStrategy: (times: number) => {
            return Math.min(times * 50, 2000)
          },
        },
      },
    },
  },
}
```

**Importante**: Redis Event Bus es **obligatorio para producción** cuando usas webhooks.[^1]

## Testing de Webhooks con Stripe CLI

### Instalación y Setup

```bash
# Instalar Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Configurar forwarding a tu servidor local
stripe listen --forward-to http://localhost:9000/hooks/payment/stripe_stripe
```

Esto devolverá un webhook secret:

```
Ready! Your webhook signing secret is whsec_...
```

Agrega este secret a tu `.env`:

```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```


### Disparar Evento de Prueba

```bash
# Disparar payment_intent.succeeded
stripe trigger payment_intent.succeeded

# Ver logs en tiempo real
stripe listen --forward-to http://localhost:9000/hooks/payment/stripe_stripe --print-json
```


### Ejemplo de Payload de `payment_intent.succeeded`

```json
{
  "id": "evt_test_...",
  "object": "event",
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_...",
      "object": "payment_intent",
      "amount": 2000,
      "currency": "usd",
      "status": "succeeded",
      "metadata": {
        "cart_id": "cart_..."
      },
      "payment_method": "pm_...",
      "created": 1234567890,
      "captured_at": 1234567890
    }
  },
  "created": 1234567890
}
```


## Debugging y Troubleshooting

### Verificar Logs del Event Bus

```typescript
// En tu subscriber
import { Logger } from "@medusajs/medusa"

export default async function handler({ event, container }: SubscriberArgs) {
  const logger: Logger = container.resolve("logger")
  
  logger.info("=== Webhook Event Received ===")
  logger.info(`Event name: ${event.name}`)
  logger.info(`Event data: ${JSON.stringify(event.data, null, 2)}`)
  logger.info("==============================")
  
  // Tu lógica...
}
```


### Problemas Comunes

**1. Error: "No signatures found matching the expected signature"**

Solución: Verifica que el `STRIPE_WEBHOOK_SECRET` coincida con el secret del webhook en Stripe[^7]

```typescript
// Verificar en medusa-config.ts
options: {
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
}
```

**2. Evento recibido pero subscriber no se ejecuta**

Solución: Verifica que el Event Bus esté configurado correctamente y Redis esté corriendo[^1]

```bash
# Verificar Redis
redis-cli ping
# Debe retornar: PONG
```

**3. Error: "payment - id must be defined"**

Solución: Asegúrate de que el cart tenga un payment_session válido antes de procesar[^8]

```typescript
const cart = await cartService.retrieve(cartId, {
  relations: ["payment_sessions"],
})

if (!cart.payment_sessions?.length) {
  throw new Error("No payment sessions found for cart")
}
```

**4. Eventos duplicados**

Solución: Implementa idempotencia usando el ID del payment como clave única[^3]

```typescript
// Verificar si el payment ya tiene orden asociada
if (payment.order_id) {
  logger.info("Payment already processed, skipping")
  return
}
```


## Mejores Prácticas

### 1. Retornar 200 Inmediatamente

El webhook handler debe retornar success lo antes posible:[^1]

```typescript
// ✅ CORRECTO - La ruta API built-in lo hace automáticamente
// El procesamiento ocurre asíncronamente en el subscriber

// ❌ INCORRECTO - Procesar en la ruta del webhook
export async function POST(req, res) {
  await longRunningOperation() // NO hacer esto
  res.status(200).send()
}
```


### 2. Usar Delay para Evitar Race Conditions

Configurar un delay apropiado en el plugin de Stripe:[^1]

```typescript
{
  resolve: "medusa-payment-stripe",
  options: {
    webhookDelay: 5000, // 5 segundos (recomendado)
  },
}
```


### 3. Implementar Idempotencia

Siempre verificar si el evento ya fue procesado:[^3]

```typescript
if (payment.order_id) {
  logger.info("Order already created")
  return
}
```


### 4. Manejar Errores Apropiadamente

Lanzar errores para activar el retry del Event Bus:[^6]

```typescript
try {
  await criticalOperation()
} catch (error) {
  logger.error("Critical error occurred:", error)
  throw error // Esto activará el retry
}
```


### 5. Usar Relaciones para Evitar Queries Adicionales

```typescript
// ✅ CORRECTO
const payment = await paymentService.retrieve(paymentId, {
  relations: ["cart", "cart.customer", "order"],
})

// ❌ INCORRECTO
const payment = await paymentService.retrieve(paymentId)
const cart = await cartService.retrieve(payment.cart_id)
const customer = await customerService.retrieve(cart.customer_id)
```


## Estructura de Archivos Recomendada

```
src/
├── subscribers/
│   ├── payment-intent-succeeded.ts
│   ├── payment-intent-failed.ts
│   └── payment-authorized.ts
├── services/
│   └── custom-payment-processor.ts
├── api/
│   └── webhooks/
│       └── custom-stripe-handler.ts (si necesitas custom handler)
└── workflows/
    └── complete-order-on-payment.ts
```


## TypeScript Types Útiles

```typescript
import { 
  SubscriberArgs, 
  SubscriberConfig,
  Logger,
  PaymentService,
  CartService,
  OrderService,
  EventBusService,
} from "@medusajs/medusa"

// Type para el payload del evento payment.captured
type PaymentCapturedData = {
  id: string // payment ID
}

// Type para el subscriber config
type PaymentSubscriberConfig = SubscriberConfig & {
  event: "payment.captured" | "payment.authorized" | "payment.failed"
}

// Type para el subscriber handler
type PaymentSubscriberHandler = (
  args: SubscriberArgs<PaymentCapturedData>
) => Promise<void>
```


***

**Formato optimizado para Claude 4.5**: Esta documentación está estructurada para uso como prompt de referencia, con ejemplos completos de código TypeScript, casos de uso reales, y arquitectura detallada específica para MedusaJS v1.20.11.
<span style="display:none">[^10][^11][^12][^13][^14][^15][^16][^17][^18][^9]</span>

<div align="center">⁂</div>

[^1]: https://docs.medusajs.com/v1/upgrade-guides/plugins/stripe/6-0-7

[^2]: https://help.cometly.com/en/articles/11012950-stripe-webhooks-integration

[^3]: https://www.hooklistener.com/learn/stripe-webhooks-implementation

[^4]: https://docs.medusajs.com/resources/commerce-modules/payment/payment-provider/stripe

[^5]: https://harryparkes.com/blog/medusajs-stripe-subscriptions

[^6]: https://docs.medusajs.com/learn/fundamentals/events-and-subscribers

[^7]: https://github.com/medusajs/medusa/issues/1626

[^8]: https://github.com/medusajs/medusa/issues/9998

[^9]: https://medusajs.com/integrations/lambdacurry-webhooks/

[^10]: https://docs.medusajs.com/learn/fundamentals/workflows/workflow-hooks

[^11]: https://docs.medusajs.com/resources/commerce-modules/payment/webhook-events

[^12]: https://docs.medusajs.com/resources/js-sdk

[^13]: https://docs.medusajs.com/resources/nextjs-starter/guides/customize-stripe

[^14]: https://docs.medusajs.com/learn/configurations/ts-aliases

[^15]: https://docs.medusajs.com/v1/references/types/interfaces/types.IPaymentProvider

[^16]: https://docs.medusajs.com/v1/upgrade-guides/medusa-core/1-20

[^17]: https://github.com/medusajs/medusa/issues/9997

[^18]: https://docs.medusajs.com/resources/how-to-tutorials/tutorials/agentic-commerce

[^19]: https://docs.medusajs.com/resources/integrations/guides/resend

