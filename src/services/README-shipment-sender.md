# Servicio de Notificación de Envío

Este servicio se encarga de enviar notificaciones por email cuando se crea un envío (shipment) en Medusa, adjuntando el PDF de la factura generada por el servicio `invoice-generator`.

## Funcionalidad

- **Escucha el evento**: `order.shipment_created`
- **Envía emails usando**: MailerSend API
- **Adjunta**: PDF de la factura del pedido
- **Notifica a**: Cliente que realizó el pedido

## Archivos Principales

- **Servicio**: `src/services/shipment-sender.ts`
- **Subscriber**: `src/subscribers/shipment-created.ts`
- **Loader**: `src/loaders/notification.ts` (registra el servicio)

## Configuración

El servicio requiere las siguientes variables de entorno:

```env
# MailerSend API Key
MAILERSEND_API_KEY=your_mailersend_api_key

# Template ID para notificaciones de envío
MAILERSEND_SHIPMENT_CREATED_TEMPLATE_ID=your_template_id

# Configuración del remitente
MAILERSEND_SENDER_EMAIL=equipo@cartago4x4.es
MAILERSEND_SENDER_NAME=Cartago 4x4
MAILERSEND_COMPANY_NAME=Cartago 4x4

# URLs opcionales
MAILERSEND_SHIPMENT_CREATED_URL=https://your-store.com/shipments
MAILERSEND_SUPPORT_URL=https://your-store.com/support
```

## Flujo de Funcionamiento

1. **Trigger**: Se crea un fulfillment/envío en el admin de Medusa
2. **Evento**: Se emite el evento `order.shipment_created`
3. **Subscriber**: El subscriber `shipment-created.ts` captura el evento
4. **Procesamiento**:
   - Obtiene los datos del fulfillment y la orden
   - Llama al servicio `shipment-sender`
5. **Generación de PDF**: El servicio usa `invoice-generator` para crear el PDF
6. **Envío**: Se envía el email con el PDF adjunto usando MailerSend

## Datos del Template

El template de MailerSend recibe los siguientes datos:

```typescript
interface MailerSendShipmentData {
  company_name: string;
  display_id: number;
  shipment_date: string;
  tracking_numbers?: string[];
  customer: {
    first_name: string;
    last_name: string;
    full_name: string;
    email: string;
    phone?: string;
    nif_cif?: string;
  };
  shipping_address: string;
  billing_address?: string;
  shipping_method: string;
  shipping_total: string;
  currency: string;
  subtotal_ex_tax: string;
  subtotal: string;
  tax_total: string;
  tax_rate?: number;
  total: string;
  items: Array<{
    title: string;
    quantity: number;
    variant: string;
    price: string;
    ref: string;
    sku?: string;
    unit_price_ex_tax: string;
    unit_price: string;
    totals: {
      tax_total: string;
      discount_total: string;
      subtotal: string;
      total: string;
    };
  }>;
  discount_total?: string;
  order_url?: string;
}
```

## Archivos Adjuntos

- **PDF de la factura**: Generado dinámicamente usando el servicio `invoice-generator`
- **Nombre del archivo**: `Cartago4x4_factura_{display_id}.pdf`

## Logs

El servicio genera logs informativos:

```
[NOTIFICATION] Shipment created subscriber triggered for fulfillment {fulfillment_id}
[NOTIFICATION] Sending shipment.created notification for order {display_id}
[NOTIFICATION] Successfully sent shipment.created email with invoice to {email} for order {display_id}
```

## Manejo de Errores

Si no se puede enviar el email (por falta de configuración, problemas con MailerSend, etc.), el servicio registra el error y devuelve un estado de "failed".

## Dependencias

- **MailerSend**: Para el envío de emails
- **InvoiceGeneratorService**: Para generar el PDF de la factura
- **OrderService**: Para obtener datos de la orden
- **Utilidades**: `format-utils` y `order-utils` para formatear datos

## Integración con Eventos

Para que el servicio funcione correctamente, es necesario que algún otro servicio o proceso emita el evento `order.shipment_created` cuando se cree un fulfillment. Esto puede hacerse:

1. **Desde el admin**: Cuando se marca un pedido como "shipped"
2. **API personalizada**: Endpoint que crea fulfillments y emite el evento
3. **Webhook**: Desde servicios externos de logística

## Ejemplo de Emisión del Evento

```typescript
// En un servicio que crea fulfillments
const eventBus = container.resolve("eventBusService");
await eventBus.emit("order.shipment_created", {
  id: fulfillment.id,
  order_id: fulfillment.order_id,
});
```
