<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Elabora documento de contexto para LLM's, para implementar la integración de los productos de Medusajs v1.20.11 en la plataforma de mail marketing BREVO.

El objetivo es aprovechar las capacidades de e-commerce de la plataforma, permitiendo suscripciones a productos SIN STOCK, para enviar avisos de disponibilidad cuando haya disponibilidad.

[Create a product alert for a contact | Brevo API Documentation](https://developers.brevo.com/reference/create-product-alert)

Para ello debe implementarse un webhook o servicio que dispare el envío a suscriptores de un producto cuando el numero de unidades de éste sea mayor que 0. La actualización del inventario se realiza a través del panel admin de Medusa, en la  Stock section de un Variant:
[Manage Products | Medusa](https://docs.medusajs.com/v1/user-guide/products/manage#variants-section)
[Update a Product Variant - Medusa Admin API Reference](https://docs.medusajs.com/v1/api/admin#products_postproductsproductvariantsvariant)

Aquí tienes un **documento de contexto técnico** adaptado para un LLM o equipo de desarrollo, con el propósito de diseñar la integración entre **MedusaJS v1.20.11** y **Brevo (Sendinblue)** para automatizar alertas de disponibilidad de productos sin stock.

***

## Documento de Contexto: Integración MedusaJS ↔️ Brevo

### 1. Objetivo General

Implementar una integración entre **MedusaJS (v1.20.11)** y la plataforma de **email marketing Brevo**, que permita a los usuarios suscribirse a productos actualmente sin stock y recibir una **notificación automática** por correo cuando dicho producto vuelva a estar disponible.

***

### 2. Descripción Funcional

#### Escenario principal

1. Un cliente visita la tienda (frontend conectado a MedusaJS).
2. Encuentra un producto agotado y decide suscribirse para recibir una alerta.
3. El sistema almacena la suscripción (email + ID del producto/variant).
4. Cuando el stock del producto aumenta (ej. de 0 a >0), se dispara un **evento o webhook** que notifica a Brevo.
5. Brevo envía el correo de alerta a los suscriptores mediante su endpoint público.

***

### 3. Recursos Técnicos Implicados

#### MedusaJS v1.20.11

- **Gestión de producto y variantes:**
Cada variante tiene una propiedad `inventory_quantity`.
[Manage Products - Medusa Docs](https://docs.medusajs.com/v1/user-guide/products/manage#variants-section)
- **Actualización de inventario vía Admin API:**
[Update a Product Variant - Admin API](https://docs.medusajs.com/v1/api/admin#products_postproductsproductvariantsvariant)
- **Posibilidad de Webhooks o Subscribers:**
MedusaJS permite crear **subscribers personalizados** a eventos del dominio (`product.updated`, `variant.updated`, etc.) usando el sistema de eventos interno de Medusa.


#### Brevo API

Endpoint relevante:
[Create a product alert for a contact](https://developers.brevo.com/reference/create-product-alert)

**Método:** `POST /v3/ecommerce/contacts/{email}/productAlerts`

**Requisitos:**

- `email` del contacto (identifica al suscriptor).
- `productId` o `variantId` (dependiendo del nivel de granularidad).
- Datos opcionales: URL del producto, mensaje, etc.

***

### 4. Flujo de Integración (Arquitectura Lógica)

#### Paso 1: Recibir suscripción desde el frontend

- En el producto sin stock, mostrar botón “Notificarme cuando esté disponible”.
- Al enviar el formulario, el backend registra:
    - `email` del suscriptor.
    - `product_id` o `variant_id`.
    - `fecha de suscripción`.
    - Estado: “pendiente de stock”.


#### Paso 2: Detección del cambio de stock

- Un admin actualiza el stock del variant desde el **Panel Admin** de Medusa.
- Este cambio desencadena un **evento `product-variant.updated`**.


#### Paso 3: Proceso del evento

- Un **subscriber (custom service)** en Medusa escucha el evento y evalúa:

```js
if (previousVariant.inventory_quantity === 0 && updatedVariant.inventory_quantity > 0)
    triggerProductAvailable(updatedVariant.id)
```

- Este trigger obtiene los suscriptores pendientes y llama al servicio de alerta.


#### Paso 4: Comunicación con Brevo

- Por cada suscriptor pendiente:
    - Se usa la **API de Brevo** para crear una alerta:

```http
POST /v3/ecommerce/contacts/{email}/productAlerts
Content-Type: application/json
{
  "productId": "variant_id",
  "alertType": "BACK_IN_STOCK",
  "message": "El producto que te interesa ya está disponible 🎉"
}
```

- Brevo se encarga de enviar el email según las configuraciones de marketing.


#### Paso 5: Limpieza o actualización

- Marcar al suscriptor como “notificado”.
- (Opcional) Eliminar la suscripción para evitar envíos repetidos.

***

### 5. Componentes a Desarrollar

1. **Endpoint Backend (Medusa plugin o custom route):**
    - `/store/product-alerts` → POST
Guarda las suscripciones (email + product/variantId).
2. **Subscriber/Service de actualización de inventario:**
    - Escucha `variant.updated`.
    - Comprueba condición de stock.
    - Ejecuta función de integración con Brevo.
3. **Servicio de integración con Brevo:**
    - Cliente HTTP para llamar al endpoint oficial.
    - Logs y manejo de errores (rate limits, duplicados, etc.).

***

### 6. Consideraciones Técnicas

- **Autenticación:**
Brevo usa API Key (header `api-key`) con permisos `Transactional and Ecommerce`.
- **Tolerancia a fallos:**
Incluir reintentos y colas (ej. Redis o Medusa background jobs).
- **Privacidad:**
Cumplir RGPD, almacenando solo emails y datos mínimos de producto.
Los usuarios deben poder darse de baja.
- **Versionado:**
Aplicable a MedusaJS `v1.20.11` (pre v2.0). Cambios posteriores de event listeners pueden requerir adaptación.

***

### 7. Esquema de Datos Sugerido (para suscripciones)

| Campo | Tipo | Descripción |
| :-- | :-- | :-- |
| id | string | Identificador interno |
| email | string | Correo del suscriptor |
| variant_id | string | ID de la variante del producto |
| notified_at | date | Fecha de notificación |
| created_at | date | Fecha de suscripción |
| status | enum | `pending` / `notified` / `cancelled` |


***

### 8. Ejemplo Básico del Subscriber (Node.js / Medusa)

```js
// src/subscribers/variant-stock-subscriber.js
class VariantStockSubscriber {
  constructor({ eventBusService, productAlertService }) {
    this.productAlertService = productAlertService;
    eventBusService.subscribe("product-variant.updated", this.handleVariantUpdate);
  }

  async handleVariantUpdate({ id, fields, previous, updated }) {
    if (previous.inventory_quantity === 0 && updated.inventory_quantity > 0) {
      await this.productAlertService.notifySubscribers(updated.id);
    }
  }
}

export default VariantStockSubscriber;
```


***

¿Quieres que el próximo paso sea convertir este documento en un **esquema de implementación (con endpoints, payloads y flujos)** para integración directa en código?

