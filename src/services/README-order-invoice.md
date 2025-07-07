# Servicio de Numeración de Facturas

Este servicio se encarga de generar y establecer automáticamente el número de factura para los pedidos después de que se procese el evento `ORDER_PLACED`.

## Funcionamiento

1. **Evento Trigger**: El servicio se ejecuta automáticamente cuando se dispara el evento `OrderService.Events.PLACED`.

2. **Generación del Número**:

   - Formato: `{AÑO}-{NUMERO_REFERENCIA + DISPLAY_ID}`
   - Ejemplo: `2025-10001` (para el año 2025, con INVOICE_START_REF=10000 y display_id=1)

3. **Almacenamiento**: El número de factura se guarda en los metadatos del pedido bajo la clave `invoice_number`.

## Archivos Principales

- **Servicio**: `src/services/order-invoice.ts`
- **Subscriber**: `src/subscribers/order-invoice-generator.ts`
- **Loader**: `src/loaders/services.ts`
- **Tests**: `src/services/__tests__/order-invoice.spec.ts`

## Configuración

Agregar la siguiente variable de entorno:

```bash
# Número de referencia inicial para las facturas
INVOICE_START_REF=10000
```

## Métodos Principales

### `getInvoiceNumber(order: Order): string | undefined`

Genera el número de factura basado en el display_id del pedido.

### `setOrderInvoiceNumber(orderId: string): Promise<Order>`

Establece el número de factura en los metadatos del pedido.

## Ejemplo de Uso

```typescript
const orderInvoiceService = container.resolve("orderInvoiceService");
const updatedOrder = await orderInvoiceService.setOrderInvoiceNumber(
  "order_123"
);
console.log(updatedOrder.metadata.invoice_number); // "2025-10001"
```

## Integración con Eventos

El servicio se integra automáticamente con el sistema de eventos de Medusa:

1. Se dispara el evento `OrderService.Events.PLACED`
2. El subscriber `order-invoice-generator` escucha este evento
3. Se ejecuta el servicio para generar y establecer el número de factura
4. El número queda disponible en `order.metadata.invoice_number`

## Logs

El servicio genera logs informativos:

```
[ORDER-INVOICE] Estableciendo número de factura 2025-10001 para el pedido 1
[ORDER-INVOICE] Número de factura establecido exitosamente para el pedido 1
```

## Manejo de Errores

Si no se puede generar el número de factura (por ejemplo, si el pedido no tiene display_id), el servicio lanza un error descriptivo y lo registra en los logs.
