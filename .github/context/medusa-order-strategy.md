<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Documentación: Estrategia de Creación de Order en MedusaJS v1.20.11

## Contexto

Esta documentación detalla la arquitectura interna de creación de órdenes en MedusaJS v1.20.11, incluyendo los servicios involucrados, la secuencia de ejecución, los eventos emitidos y los puntos de recuperación durante el proceso.[^1][^2]

## Arquitectura General

La creación de una orden en MedusaJS sigue un patrón de **Cart Completion Strategy**, que transforma un carrito (Cart) en una orden (Order) mediante una serie de pasos coordinados con manejo de errores mediante Idempotency Keys.[^2][^1]

### Dos Caminos para Crear Órdenes

MedusaJS v1.20.11 proporciona dos formas principales de crear órdenes:[^3][^4]

1. **Desde un Cart (Checkout estándar)**: El cliente añade productos al carrito y completa el checkout
2. **Desde un Draft Order**: El comerciante crea una orden en nombre del cliente

Ambos métodos convergen en el servicio `OrderService.createFromCart()`.[^3][^1]

## Servicios Principales Involucrados

### 1. CartService

**Responsabilidades**:

- Gestionar el ciclo de vida del carrito
- Crear sesiones de pago
- Autorizar pagos
- Calcular totales con impuestos
- Ejecutar la estrategia de completado del carrito[^2]

**Métodos clave**:

- `createPaymentSessions(cartId)`: Inicializa sesiones de pago disponibles
- `setPaymentSession(cartId, providerId)`: Establece el proveedor de pago activo
- `updatePaymentSession(cartId, providerId, data)`: Actualiza datos de la sesión
- `authorizePayment(cartId)`: Autoriza el pago con el proveedor seleccionado
- `createTaxLines(cartId)`: Calcula y crea líneas de impuestos
- `decorateTotals(cart)`: Añade totales calculados al objeto cart
- `retrieveWithTotals(cartId)`: Recupera carrito con totales calculados[^1][^2]


### 2. OrderService

**Responsabilidades**:

- Crear órdenes desde carritos completados
- Gestionar el ciclo de vida de las órdenes
- Emitir eventos relacionados con órdenes
- Coordinar fulfillment, captura de pagos y devoluciones[^5][^6]

**Métodos clave**:

- `createFromCart(cart)`: Crea una orden desde un carrito autorizado
- `retrieve(orderId)`: Recupera una orden por ID
- `capturePayment(orderId)`: Captura el pago de una orden
- `createFulfillment(orderId, items)`: Crea fulfillment para la orden
- `cancel(orderId)`: Cancela una orden[^6][^5]

**Dependencias del OrderService**:[^5][^6]

```javascript
{
  manager_: EntityManager,
  orderRepository_: Repository<Order>,
  customerService_: CustomerService,
  paymentProviderService_: PaymentProviderService,
  shippingOptionService_: ShippingOptionService,
  shippingProfileService_: ShippingProfileService,
  discountService_: DiscountService,
  fulfillmentProviderService_: FulfillmentProviderService,
  fulfillmentService_: FulfillmentService,
  lineItemService_: LineItemService,
  totalsService_: TotalsService,
  regionService_: RegionService,
  cartService_: CartService,
  addressRepository_: Repository<Address>,
  giftCardService_: GiftCardService,
  draftOrderService_: DraftOrderService,
  inventoryService_: IInventoryService,
  eventBus_: EventBusService,
  productVariantInventoryService_: ProductVariantInventoryService
}
```


### 3. PaymentProviderService

**Responsabilidades**:

- Coordinar con proveedores de pago (Stripe, PayPal, etc.)
- Autorizar y capturar pagos
- Gestionar reembolsos[^6]


### 4. ProductVariantInventoryService

**Responsabilidades**:

- Verificar disponibilidad de inventario
- Reservar cantidades de productos
- Liberar reservas en caso de error[^1][^2]


### 5. EventBusService

**Responsabilidades**:

- Emitir eventos del sistema
- Gestionar suscripciones a eventos
- Coordinar ejecución asíncrona de subscribers[^7][^8]


### 6. TotalsService

**Responsabilidades**:

- Calcular totales del carrito y orden
- Aplicar impuestos, descuentos y gift cards
- Calcular subtotales y totales finales[^6][^1]


## Estrategia de Completado del Carrito

La estrategia de completado se implementa en `cartCompletionStrategy` y es customizable.[^2][^1]

### Idempotency Key y Recovery Points

El proceso utiliza **Idempotency Keys** para permitir reintentos seguros en caso de errores. Cada paso tiene un **recovery point** que marca el progreso:[^1][^2]

1. `started`
2. `tax_lines_created`
3. `payment_authorized`
4. `finished`

### Flujo Completo de Cart Completion

```
┌─────────────────────────────────────────────────────────────┐
│                  POST /store/carts/:id/complete             │
└─────────────────────────────────────┬───────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 1: Recovery Point = "started"                         │
│  ─────────────────────────────────────────────────────────  │
│  • CartService.createTaxLines(cartId)                       │
│  • Calcula impuestos basándose en región y productos        │
│  • Si éxito → Recovery Point = "tax_lines_created"          │
└─────────────────────────────────────┬───────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 2: Recovery Point = "tax_lines_created"               │
│  ─────────────────────────────────────────────────────────  │
│  • CartService.authorizePayment(cartId)                     │
│  • PaymentProviderService autoriza el pago                  │
│  • Si pago requiere acción → Elimina tax lines y termina    │
│  • Si autorizado → Recovery Point = "payment_authorized"    │
└─────────────────────────────────────┬───────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 3: Recovery Point = "payment_authorized"              │
│  ─────────────────────────────────────────────────────────  │
│  • CartService.createTaxLines(cartId) [segunda vez]         │
│  • ProductVariantInventoryService.confirmInventory()        │
│  • Para cada item del carrito:                              │
│    - Verifica stock disponible                              │
│    - ProductVariantInventoryService.reserveQuantity()       │
│  • Si falta stock:                                           │
│    - Elimina reservas creadas                               │
│    - Cancela pago autorizado                                │
│    - Lanza error y termina                                  │
└─────────────────────────────────────┬───────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 4: Verificar tipo de carrito                          │
└─────────────────────────────────────┬───────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
        ┌───────────────────────┐         ┌───────────────────────┐
        │ cart.type === "swap"  │         │ cart.type === "default"│
        └───────────┬───────────┘         └───────────┬───────────┘
                    │                                   │
                    ▼                                   ▼
    ┌──────────────────────────────┐    ┌──────────────────────────────┐
    │ SwapService.                 │    │ OrderService.createFromCart()│
    │ registerCartCompletion()     │    │                              │
    │ • Completa el swap           │    │ • Crea entidad Order         │
    │ • Libera reservas inventario │    │ • Asocia payment y cart      │
    │ • Termina proceso            │    │ • Copia line items           │
    └──────────────────────────────┘    │ • Copia shipping methods     │
                                        │ • Copia direcciones          │
                                        │ • Calcula totales finales    │
                                        │ • Guarda order en DB         │
                                        └──────────────┬───────────────┘
                                                       │
                                                       ▼
                                        ┌──────────────────────────────┐
                                        │ EventBusService.emit()       │
                                        │ Evento: "order.placed"       │
                                        │ Data: { id: order.id }       │
                                        └──────────────┬───────────────┘
                                                       │
                                                       ▼
                                        ┌──────────────────────────────┐
                                        │ Recovery Point = "finished"  │
                                        │ Retorna Order al cliente     │
                                        └──────────────────────────────┘
```


### Detalles de cada paso

#### Paso 1: Creación de Tax Lines (Inicio)

```javascript
// Recovery point: "started"
await cartService.createTaxLines(cartId)
```

**Responsabilidades**:

- `TaxProviderService` calcula impuestos basándose en:
    - Region del carrito
    - Productos y sus categorías fiscales
    - Dirección de envío
- Crea registros `LineItemTaxLine` para cada item
- Crea registros `ShippingMethodTaxLine` para métodos de envío[^2][^1]


#### Paso 2: Autorización del Pago

```javascript
// Recovery point: "tax_lines_created"
const payment = await cartService.authorizePayment(cartId)
```

**Responsabilidades**:

- Identifica el `payment_session` activo del carrito
- Llama al `PaymentProviderService.authorizePayment()`
- El proveedor específico (PayPal, Stripe, etc.) procesa la autorización
- Si el pago requiere acción adicional (`requires_more`), elimina tax lines y termina
- Si autorizado, crea entidad `Payment` y la asocia al carrito
- Establece `cart.payment_authorized_at` con timestamp actual[^1][^2]

**Estados posibles del pago**:

- `authorized`: Pago autorizado exitosamente
- `requires_more`: Requiere acción adicional (3D Secure, etc.)
- `pending`: Pendiente de autorización
- `error`: Error en autorización[^6]


#### Paso 3: Confirmación de Inventario y Reserva

```javascript
// Recovery point: "payment_authorized"
await cartService.createTaxLines(cartId) // Recalcula por si cambiaron precios

for (const item of cart.items) {
  const available = await productVariantInventoryService.confirmInventory(
    item.variant_id,
    item.quantity
  )
  
  if (available) {
    await productVariantInventoryService.reserveQuantity(
      item.variant_id,
      item.quantity,
      { lineItemId: item.id, inventoryItemId: item.inventory_item_id }
    )
  } else {
    // Rollback: eliminar reservas previas y cancelar pago
    await cleanupReservations()
    await paymentProviderService.cancelPayment(cart.payment)
    throw new Error("Item out of stock")
  }
}
```

**Responsabilidades**:

- Recalcula tax lines por si hubo cambios de precio
- Para cada line item del carrito:
    - Verifica disponibilidad en inventario
    - Reserva la cantidad si está disponible
- Si algún item no está disponible:
    - Elimina todas las reservas creadas
    - Cancela el pago autorizado
    - Lanza error y termina el proceso[^2][^1]


#### Paso 4: Creación de la Orden

```javascript
// Solo si cart.type === "default"
const order = await orderService.createFromCart(cart)
```

**Método OrderService.createFromCart() - Pseudocódigo**:

```javascript
async createFromCart(cart) {
  // 1. Validaciones
  if (!cart.payment_authorized_at) {
    throw new Error("Payment not authorized")
  }
  
  // 2. Preparar datos de la orden
  const orderData = {
    payment_status: cart.payment.status === "captured" ? "captured" : "awaiting",
    fulfillment_status: "not_fulfilled",
    status: "pending",
    display_id: await this.generateDisplayId(),
    cart_id: cart.id,
    customer_id: cart.customer_id,
    email: cart.email,
    region_id: cart.region_id,
    currency_code: cart.region.currency_code,
    tax_rate: cart.region.tax_rate,
    
    // Copiar metadata
    metadata: cart.metadata,
    
    // Calcular totales
    ...await totalsService.getTotal(cart)
  }
  
  // 3. Copiar direcciones
  if (cart.shipping_address_id) {
    const shippingAddress = await addressRepository.findOne(cart.shipping_address_id)
    orderData.shipping_address = { ...shippingAddress }
  }
  
  if (cart.billing_address_id) {
    const billingAddress = await addressRepository.findOne(cart.billing_address_id)
    orderData.billing_address = { ...billingAddress }
  }
  
  // 4. Crear entidad Order
  const order = orderRepository.create(orderData)
  await orderRepository.save(order)
  
  // 5. Asociar line items al order
  for (const item of cart.items) {
    item.order_id = order.id
    item.fulfilled_quantity = 0
    await lineItemService.update(item.id, item)
  }
  
  // 6. Asociar shipping methods al order
  for (const method of cart.shipping_methods) {
    method.order_id = order.id
    await shippingMethodRepository.save(method)
  }
  
  // 7. Asociar discounts al order
  for (const discount of cart.discounts) {
    await orderRepository.addDiscount(order.id, discount.code)
  }
  
  // 8. Asociar gift cards si fueron aplicados
  for (const giftCard of cart.gift_cards) {
    await giftCardService.update(giftCard.id, {
      order_id: order.id
    })
  }
  
  // 9. Asociar payment al order
  if (cart.payment) {
    await paymentRepository.update(cart.payment.id, {
      order_id: order.id
    })
  }
  
  // 10. Marcar carrito como completado
  await cartService.update(cart.id, {
    completed_at: new Date()
  })
  
  // 11. Emitir evento order.placed
  await eventBus_.emit(OrderService.Events.PLACED, {
    id: order.id,
    no_notification: cart.context?.no_notification || false
  })
  
  return order
}
```

**Datos copiados del Cart al Order**:

- Line items (productos)
- Shipping methods (métodos de envío)
- Shipping address (dirección de envío)
- Billing address (dirección de facturación)
- Discounts aplicados
- Gift cards aplicados
- Payment asociado
- Customer ID
- Region, currency, tax rate
- Metadata personalizado[^3][^1]


#### Paso 5: Finalización

```javascript
// Recovery point: "finished"
idempotencyKey.recovery_point = "finished"
await idempotencyKeyService.update(idempotencyKey.id, { recovery_point: "finished" })

return { type: "order", data: order }
```

El proceso termina exitosamente retornando la orden creada.[^1][^2]

## Eventos Emitidos por OrderService

El `OrderService` emite eventos en diferentes puntos del ciclo de vida de una orden:[^9][^5][^6]

### Eventos de Creación

| Evento | Constante | Cuándo se emite | Data payload |
| :-- | :-- | :-- | :-- |
| `order.placed` | `OrderService.Events.PLACED` | Después de `createFromCart()` exitoso | `{ id: string, no_notification?: boolean }` |
| `order.updated` | `OrderService.Events.UPDATED` | Cuando se actualiza la orden | `{ id: string, fields: string[] }` |
| `order.gift_card_created` | `OrderService.Events.GIFT_CARD_CREATED` | Cuando se crea gift card desde orden | `{ id: string, gift_card_id: string }` |

### Eventos de Pago

| Evento | Constante | Cuándo se emite | Data payload |
| :-- | :-- | :-- | :-- |
| `order.payment_captured` | `OrderService.Events.PAYMENT_CAPTURED` | Después de `capturePayment()` exitoso | `{ id: string, payment_id: string }` |
| `order.payment_capture_failed` | `OrderService.Events.PAYMENT_CAPTURE_FAILED` | Si falla `capturePayment()` | `{ id: string, error: string }` |

### Eventos de Fulfillment

| Evento | Constante | Cuándo se emite | Data payload |
| :-- | :-- | :-- | :-- |
| `order.fulfillment_created` | `OrderService.Events.FULFILLMENT_CREATED` | Después de `createFulfillment()` | `{ id: string, fulfillment_id: string }` |
| `order.fulfillment_canceled` | `OrderService.Events.FULFILLMENT_CANCELED` | Después de `cancelFulfillment()` | `{ id: string, fulfillment_id: string }` |
| `order.shipment_created` | `OrderService.Events.SHIPMENT_CREATED` | Cuando se marca fulfillment como enviado | `{ id: string, fulfillment_id: string }` |

### Eventos de Devoluciones y Reembolsos

| Evento | Constante | Cuándo se emite | Data payload |
| :-- | :-- | :-- | :-- |
| `order.return_requested` | `OrderService.Events.RETURN_REQUESTED` | Al crear una solicitud de devolución | `{ id: string, return_id: string }` |
| `order.items_returned` | `OrderService.Events.ITEMS_RETURNED` | Cuando items son devueltos | `{ id: string, return_id: string }` |
| `order.return_action_required` | `OrderService.Events.RETURN_ACTION_REQUIRED` | Si la devolución requiere acción | `{ id: string, return_id: string }` |
| `order.refund_created` | `OrderService.Events.REFUND_CREATED` | Después de `createRefund()` exitoso | `{ id: string, refund_id: string }` |
| `order.refund_failed` | `OrderService.Events.REFUND_FAILED` | Si falla `createRefund()` | `{ id: string, error: string }` |

### Eventos de Cancelación y Completado

| Evento | Constante | Cuándo se emite | Data payload |
| :-- | :-- | :-- | :-- |
| `order.canceled` | `OrderService.Events.CANCELED` | Después de `cancel()` | `{ id: string }` |
| `order.completed` | `OrderService.Events.COMPLETED` | Cuando orden está completamente cumplida | `{ id: string }` |
| `order.swap_created` | `OrderService.Events.SWAP_CREATED` | Al crear un swap desde la orden | `{ id: string, swap_id: string }` |

## Suscribirse a Eventos: Subscribers

Los subscribers permiten ejecutar lógica personalizada cuando se emiten eventos.[^7][^9]

### Estructura de un Subscriber

```javascript
// src/subscribers/order-placed.ts
import { 
  type SubscriberConfig, 
  type SubscriberArgs,
  OrderService 
} from "@medusajs/medusa"

export default async function handleOrderPlaced({ 
  data, 
  eventName, 
  container, 
  pluginOptions 
}: SubscriberArgs<{ id: string }>) {
  
  // Resolver servicios desde el container
  const orderService: OrderService = container.resolve("orderService")
  const logger = container.resolve("logger")
  
  // Recuperar la orden completa
  const order = await orderService.retrieve(data.id, {
    relations: [
      "customer",
      "items",
      "shipping_address",
      "billing_address",
      "payments"
    ]
  })
  
  logger.info(`Order placed: ${order.display_id}`)
  
  // Lógica personalizada (enviar email, notificar ERP, etc.)
  // ...
}

export const config: SubscriberConfig = {
  event: OrderService.Events.PLACED,
  context: {
    subscriberId: "order-placed-handler",
  },
}
```


### Subscriber para Múltiples Eventos

```javascript
// src/subscribers/order-notifications.ts
import { 
  type SubscriberConfig, 
  type SubscriberArgs,
  OrderService 
} from "@medusajs/medusa"

export default async function handleOrderEvents({ 
  data, 
  eventName, 
  container 
}: SubscriberArgs<{ id: string }>) {
  
  const notificationService = container.resolve("notificationService")
  
  switch (eventName) {
    case OrderService.Events.PLACED:
      await notificationService.sendNotification(
        "order.placed",
        data,
        null
      )
      break
    
    case OrderService.Events.SHIPMENT_CREATED:
      await notificationService.sendNotification(
        "order.shipment_created",
        data,
        null
      )
      break
    
    case OrderService.Events.CANCELED:
      await notificationService.sendNotification(
        "order.canceled",
        data,
        null
      )
      break
  }
}

export const config: SubscriberConfig = {
  event: [
    OrderService.Events.PLACED,
    OrderService.Events.SHIPMENT_CREATED,
    OrderService.Events.CANCELED
  ],
  context: {
    subscriberId: "order-notifications-handler",
  },
}
```


## Manejo de Errores y Rollback

### Escenarios de Error Comunes

#### 1. Error en autorización de pago

```
Estado: Recovery point = "tax_lines_created"
Acción: 
  - No se avanza al siguiente paso
  - Tax lines creadas se mantienen para reintento
  - Cliente puede reintentar con el mismo cart_id
```


#### 2. Item fuera de stock

```
Estado: Recovery point = "payment_authorized"
Acción:
  - ProductVariantInventoryService elimina reservas ya creadas
  - PaymentProviderService cancela el pago autorizado
  - Se lanza error "Item out of stock"
  - Cliente debe actualizar carrito y reintentar
```


#### 3. Error durante createFromCart

```
Estado: Recovery point = "payment_authorized"
Acción:
  - Transacción de base de datos hace rollback
  - Reservas de inventario se mantienen
  - Pago se mantiene autorizado
  - Sistema puede reintentar automáticamente
```


### Reintentos con Idempotency Key

```javascript
// El mismo idempotency_key permite reintentos seguros
POST /store/carts/{cart_id}/complete
Headers:
  Idempotency-Key: <SAME_KEY>

// Medusa detecta el recovery point y continúa desde ahí
```


## Captura de Pago Post-Creación

Si el plugin de pago tiene `capture: false`, el pago queda en estado `authorized` y debe capturarse manualmente:[^6]

```javascript
// Desde el admin o API
await orderService.capturePayment(orderId)
```

**Proceso de captura**:

1. Recupera el `payment` asociado al order
2. Llama a `PaymentProviderService.capturePayment(payment)`
3. El proveedor (PayPal, Stripe, etc.) captura los fondos
4. Actualiza `order.payment_status = "captured"`
5. Emite evento `order.payment_captured`[^5][^6]

## Integración con Draft Orders

Los draft orders siguen un flujo similar pero con diferencias:[^3]

```javascript
// 1. Crear draft order
const draftOrder = await draftOrderService.create(draftOrderData)

// 2. Registrar pago (usa payment method "system" por defecto)
await draftOrderService.registerCartCompletion(draftOrder.id)

// 3. Internamente llama a OrderService.createFromCart()
const order = await orderService.createFromCart(draftOrder.cart)

// 4. Actualizar draft order
await draftOrderService.update(draftOrder.id, {
  status: "completed",
  order_id: order.id
})

// 5. Capturar pago si es necesario
if (order.payment_status === "awaiting") {
  await orderService.capturePayment(order.id)
}
```


## Verificación de Order Creada

### Mediante API

```bash
curl -X GET "http://localhost:9000/store/orders/{order_id}" \
  -H "Content-Type: application/json"
```


### Estructura de Order creada

```json
{
  "id": "order_01JXX...",
  "display_id": 12345,
  "status": "pending",
  "fulfillment_status": "not_fulfilled",
  "payment_status": "captured",
  "cart_id": "cart_01JXX...",
  "customer_id": "cus_01JXX...",
  "email": "customer@example.com",
  "region_id": "reg_01JXX...",
  "currency_code": "eur",
  "tax_rate": 21,
  "items": [...],
  "shipping_methods": [...],
  "payments": [...],
  "shipping_address": {...},
  "billing_address": {...},
  "total": 10000,
  "subtotal": 8264,
  "tax_total": 1736,
  "shipping_total": 500,
  "discount_total": 0,
  "created_at": "2026-01-11T01:39:00.000Z",
  "updated_at": "2026-01-11T01:39:00.000Z"
}
```


## Resumen de Dependencias entre Servicios

```
CartService
  ├── TotalsService (calcular totales)
  ├── TaxProviderService (calcular impuestos)
  ├── PaymentProviderService (autorizar pago)
  ├── ProductVariantInventoryService (reservar inventario)
  └── OrderService (crear orden)
      ├── LineItemService (gestionar items)
      ├── ShippingOptionService (métodos de envío)
      ├── DiscountService (aplicar descuentos)
      ├── GiftCardService (aplicar gift cards)
      ├── CustomerService (asociar cliente)
      ├── AddressRepository (copiar direcciones)
      ├── FulfillmentService (gestionar fulfillments)
      └── EventBusService (emitir eventos)
```


## Script de Ejemplo: Crear Order Programáticamente

```javascript
// create-order-programmatically.js
import Medusa from "@medusajs/medusa-js"

const client = new Medusa({
  baseUrl: "http://localhost:9000",
  maxRetries: 3,
})

async function createOrder() {
  try {
    // 1. Crear carrito
    console.log("1. Creando carrito...")
    const { cart } = await client.carts.create({
      region_id: "reg_XXXXXXXX",
    })
    console.log(`✓ Cart ID: ${cart.id}`)
    
    // 2. Añadir productos
    console.log("2. Añadiendo productos...")
    await client.carts.lineItems.create(cart.id, {
      variant_id: "variant_XXXXXXXX",
      quantity: 2,
    })
    
    // 3. Añadir dirección de envío
    console.log("3. Añadiendo dirección...")
    await client.carts.update(cart.id, {
      email: "buyer@example.com",
      shipping_address: {
        first_name: "Juan",
        last_name: "Pérez",
        address_1: "Calle Test 123",
        city: "Madrid",
        country_code: "es",
        postal_code: "28001",
      },
    })
    
    // 4. Añadir método de envío
    console.log("4. Añadiendo método de envío...")
    const { cart: cartWithShipping } = await client.carts.retrieve(cart.id)
    await client.carts.addShippingMethod(cart.id, {
      option_id: cartWithShipping.shipping_options[^0].id,
    })
    
    // 5. Crear sesiones de pago
    console.log("5. Creando sesiones de pago...")
    await client.carts.createPaymentSessions(cart.id)
    
    // 6. Establecer proveedor de pago
    console.log("6. Estableciendo PayPal como proveedor...")
    await client.carts.setPaymentSession(cart.id, {
      provider_id: "paypal",
    })
    
    // 7. [SIMULAR PAGO EN PAYPAL - Ver documentación anterior]
    console.log("7. Procesando pago en PayPal...")
    // ... código de integración PayPal
    
    // 8. Actualizar sesión con datos de pago
    console.log("8. Actualizando sesión con datos de captura...")
    await client.carts.updatePaymentSession(cart.id, "paypal", {
      data: {
        data: captureData, // Datos de PayPal capture
      },
    })
    
    // 9. Completar carrito → Crea Order
    console.log("9. Completando carrito (creando orden)...")
    const { data } = await client.carts.complete(cart.id)
    
    if (data.type === "order") {
      console.log("\n✓ ¡ORDEN CREADA EXITOSAMENTE!")
      console.log(`  Order ID: ${data.id}`)
      console.log(`  Display ID: ${data.display_id}`)
      console.log(`  Status: ${data.status}`)
      console.log(`  Payment Status: ${data.payment_status}`)
      console.log(`  Fulfillment Status: ${data.fulfillment_status}`)
      console.log(`  Total: ${data.total / 100} ${data.currency_code.toUpperCase()}`)
      
      // Evento "order.placed" se emite automáticamente
      console.log("\n  → Evento 'order.placed' emitido con data:", {
        id: data.id,
      })
    } else {
      console.error("✗ Error: No se creó la orden")
    }
    
  } catch (error) {
    console.error("Error:", error.message)
    console.error("Detalles:", error.response?.data)
  }
}

createOrder()
```


## Referencias

- **Cart Architecture**: https://docs.medusajs.com/v1/modules/carts-and-checkout/cart[^2]
- **OrderService Reference**: https://docs.medusajs.com/v1/references/services/classes/services.OrderService[^6]
- **Draft Orders**: https://docs.medusajs.com/v1/modules/orders/draft-orders[^3]
- **Events and Subscribers**: https://docs.medusajs.com/learn/fundamentals/events-and-subscribers[^7]
- **Order Confirmation Email**: https://docs.medusajs.com/v1/modules/orders/backend/send-order-confirmation[^9]
<span style="display:none">[^10][^11][^12][^13][^14][^15][^16][^17][^18][^19][^20]</span>

<div align="center">⁂</div>

[^1]: https://docs.medusajs.com/v1/modules/carts-and-checkout/cart

[^2]: https://developer.paypal.com/studio/checkout/standard/integrate

[^3]: https://docs.medusajs.com/v1/modules/orders/draft-orders

[^4]: https://www.docs.test.tglsupplies.com/modules/orders/

[^5]: https://docs.medusajs.com/v1/references/services/classes/services.OrderService

[^6]: https://docs.medusajs.com/v1/plugins/payment/paypal

[^7]: https://docs.medusajs.com/learn/fundamentals/events-and-subscribers

[^8]: https://docs.medusajs.com/v1/development/events/create-module

[^9]: https://docs.medusajs.com/v1/modules/orders/backend/send-order-confirmation

[^10]: https://docs.medusajs.com/resources/infrastructure-modules/event/create

[^11]: https://docs.medusajs.com/resources/references/order/createOrders

[^12]: https://www.youtube.com/watch?v=38tEhuZTrdY

[^13]: https://www.rigbyjs.com/blog/phased-replatforming-with-medusa-modules

[^14]: https://docs.medusajs.com/resources/commerce-modules/order

[^15]: https://github.com/medusajs/medusa/issues/11141

[^16]: https://docs.medusajs.com/learn/fundamentals/workflows/workflow-hooks

[^17]: https://stackoverflow.com/questions/76952950/cant-send-notification-on-order-placed-event-in-medusajs

[^18]: https://medusajs.com/order-module/

[^19]: https://github.com/medusajs/medusa/discussions/4528

[^20]: https://dev.to/u11d/medusa-checkout-flow-step-by-step-guide-to-building-a-complete-e-commerce-checkout-lfl

