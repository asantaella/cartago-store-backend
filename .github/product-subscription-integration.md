<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# si

Perfecto — a continuación te preparo un **esquema de implementación técnica directo** con endpoints, estructuras de datos, y flujo de integración entre **MedusaJS v1.20.11** y **Brevo**, listo para guiar el desarrollo del servicio.

***

## Esquema de Implementación Técnica

**Integración MedusaJS (v1.20.11) ↔ Brevo Product Alerts**

***

### 1. Arquitectura General

```
Frontend Storefront
   ↓ (POST /store/product-alerts)
Medusa Backend (Custom Plugin)
   ↓
Medusa DB (guardar suscripción)
   ↑
Subscriber escucha actualizaciones en stock (variant.updated)
   ↓
Servicio productAlertService llama a Brevo API
   ↓
Brevo envía e-mail al contacto
```


***

### 2. Endpoints Custom en Medusa

#### a. `POST /store/product-alerts`

**Función:** Registrar un usuario interesado en un producto sin stock.

**Ejemplo de Request:**

```http
POST /store/product-alerts
Content-Type: application/json

{
  "email": "cliente@ejemplo.com",
  "variant_id": "variant_01GZQ9K4Y5FJ7R7VQGMJZYBRRP"
}
```

**Respuesta esperada:**

```json
{
  "status": "success",
  "message": "Suscripción creada correctamente."
}
```

**Validaciones:**

- Email válido y no vacío.
- `variant_id` existente en catálogo (validar con `productVariantService` de Medusa).
- Evitar duplicados: si existe una suscripción activa (pending) para ese email y variant, no crear otra.

***

### 3. Modelo de Datos (ej. en Medusa DB)

**Tabla:** `product_alert_subscriptions`

```js
{
  id: string,
  email: string,
  variant_id: string,
  status: 'pending' | 'notified' | 'cancelled',
  notified_at: Date | null,
  created_at: Date
}
```


***

### 4. Subscriber: Detecta stock > 0

Archivo: `src/subscribers/variant-stock-subscriber.js`

```js
class VariantStockSubscriber {
  constructor({ eventBusService, productAlertService }) {
    this.productAlertService = productAlertService;
    eventBusService.subscribe("product-variant.updated", this.handleVariantUpdate.bind(this));
  }

  async handleVariantUpdate({ id, fields, previous, updated }) {
    const wasOutOfStock = previous.inventory_quantity === 0;
    const nowAvailable = updated.inventory_quantity > 0;

    if (wasOutOfStock && nowAvailable) {
      await this.productAlertService.notifySubscribers(updated.id);
    }
  }
}

export default VariantStockSubscriber;
```


***

### 5. Servicio de Integración con Brevo

Archivo: `src/services/product-alert.js`

```js
import axios from "axios";
import { TransactionBaseService } from "@medusajs/medusa";

class ProductAlertService extends TransactionBaseService {
  constructor({ manager, productAlertRepository }) {
    super({ manager });
    this.productAlertRepository = productAlertRepository;
    this.apiKey = process.env.BREVO_API_KEY;
  }

  async notifySubscribers(variantId) {
    const repo = this.productAlertRepository;
    const subscribers = await repo.find({ where: { variant_id: variantId, status: "pending" } });

    for (const sub of subscribers) {
      try {
        await axios.post(
          `https://api.brevo.com/v3/ecommerce/contacts/${encodeURIComponent(sub.email)}/productAlerts`,
          {
            productId: variantId,
            alertType: "BACK_IN_STOCK",
            message: "¡El producto que te interesa ya está disponible!"
          },
          {
            headers: { "api-key": this.apiKey, "Content-Type": "application/json" }
          }
        );

        sub.status = "notified";
        sub.notified_at = new Date();
        await repo.save(sub);
      } catch (err) {
        console.error(`Error notificando a ${sub.email}`, err.message);
      }
    }
  }
}

export default ProductAlertService;
```


***

### 6. Repositorio Custom Medusa

Archivo: `src/repositories/product-alert.js`

```js
import { EntityRepository, Repository } from "typeorm";
import { ProductAlert } from "../models/product-alert";

@EntityRepository(ProductAlert)
export class ProductAlertRepository extends Repository<ProductAlert> {}
```

Modelo (TypeORM):

```js
import { Entity, PrimaryColumn, Column, CreateDateColumn } from "typeorm";

@Entity()
export class ProductAlert {
  @PrimaryColumn()
  id = "";

  @Column()
  email = "";

  @Column()
  variant_id = "";

  @Column({ default: "pending" })
  status = "pending";

  @Column({ nullable: true })
  notified_at = null;

  @CreateDateColumn()
  created_at = new Date();
}
```


***

### 7. Variables de Entorno

```env
BREVO_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```


***

### 8. Flujo Final (Resumen)

1. El cliente se suscribe → `POST /store/product-alerts`.
2. Se guarda en base de datos `status = pending`.
3. Admin actualiza el stock en Medusa → evento `variant.updated`.
4. Subscriber comprueba cambio a disponibilidad.
5. Se llama a `Brevo API` → `POST /v3/ecommerce/contacts/{email}/productAlerts`.
6. Se marca registro como `notified`.

***

¿Quieres que el siguiente paso incluya un **ejemplo funcional completo en Node.js (plugin Medusa)** con estructura de carpetas y archivos listos para implementar?

