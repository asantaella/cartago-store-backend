# Configuración de Nodemailer para Product Alerts

## Descripción General

El sistema de alertas de productos ahora utiliza **Nodemailer** con **nodemailer-express-handlebars** para enviar emails transaccionales con templates dinámicos en formato Handlebars.

## Estructura de Directorios

```
cartago-store-backend/
├── views/
│   ├── emails/                           # Templates Handlebars
│   │   ├── back-in-stock-alert.handlebars
│   │   ├── back-in-stock-alert-admin.handlebars
│   │   └── client-product-subscription-alert.handlebars
│   └── partials/                         # Componentes reutilizables (opcional)
├── src/
│   └── services/
│       └── product-alert.ts             # Servicio principal
```

## Dependencias Instaladas

```json
{
  "nodemailer": "^6.x.x",
  "nodemailer-express-handlebars": "^x.x.x",
  "handlebars": "^4.x.x"
}
```

## Variables de Entorno Requeridas

Agregua estas variables a tu archivo `.env`:

```env
# SMTP Configuration
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-brevo-email@example.com
SMTP_PASS=your-brevo-smtp-password
SMTP_FROM=noreply@cartago4x4.com

# Admin Email
ADMIN_EMAIL=admin@cartago4x4.com

# Store URLs
STORE_URL=https://cartago4x4.com
```

## Clases Principales

### NodemailerTransporterFactory

Factoria para crear instancias del transporter de Nodemailer configurado con:
- Servidor SMTP (por defecto Brevo)
- Plugin Handlebars para renderizar templates
- Paths configurados para views/emails y views/partials

```typescript
const transporter = NodemailerTransporterFactory.createTransporter();
```

### ProductAlertNotifier

Clase encargada de enviar notificaciones usando Nodemailer:

#### `sendAdminNotification()`
Envia notificación al admin cuando se crea o reactiva una suscripción.

**Variables de contexto:**
- `is_new`: boolean - Si es nueva suscripción o reactivada
- `subscriber_email`: string - Email del suscriptor
- `image_url`: string - URL de la imagen del producto
- `variant_title`: string - Nombre de la variante
- `product_sku`: string - SKU del producto
- `product_url`: string - URL del producto
- `current_year`: number - Año actual

#### `sendBackInStockNotifications()`
Envia notificación a todos los suscriptores cuando un producto vuelve a estar disponible.

**Variables de contexto:**
- `product_name`: string - Nombre del producto
- `product_url`: string - URL del producto
- `product_image`: string - URL de la imagen
- `product_price`: string - Precio formateado
- `variant_sku`: string - SKU del producto
- `unsubscribe_url`: string - URL para desuscribirse
- `current_year`: number - Año actual

#### `sendAdminBackInStockNotification()`
Envia notificación al admin confirmando que se han enviado los avisos.

**Variables de contexto:**
- `subscribers_count`: number - Número de suscriptores notificados
- `image_url`: string - URL de la imagen
- `variant_title`: string - Nombre de la variante
- `product_url`: string - URL del producto
- `subscribers`: array - Lista de suscriptores
- `current_year`: number - Año actual

## Templates Handlebars

### back-in-stock-alert.handlebars
Template para clientes cuando un producto vuelve a estar disponible.

**Características:**
- Header con logo y branding
- Card del producto con imagen, nombre y precio
- CTA principal "Ver producto"
- Footer con contacto y links legales
- Link de desuscripción

### back-in-stock-alert-admin.handlebars
Template para admin confirmando envío de alertas.

**Características:**
- Estadísticas de envío (cantidad de clientes)
- Card del producto
- Lista de suscriptores notificados
- Footer con links administrativos

### client-product-subscription-alert.handlebars
Template para admin notificando nueva suscripción o reactivación.

**Características:**
- Indicador de nueva suscripción vs reactivada
- Email del suscriptor
- Información del producto
- Estado de la suscripción
- Acciones recomendadas

## Sintaxis Handlebars

### Variables Simples
```handlebars
{{product_name}}
{{current_year}}
```

### Condicionales
```handlebars
{{#if is_new}}
  <p>Nueva suscripción</p>
{{else}}
  <p>Suscripción reactivada</p>
{{/if}}
```

### Loops
```handlebars
{{#each subscribers}}
  <div>• {{this.email}}</div>
{{/each}}
```

## Flujo de Envío

### 1. Nueva Suscripción
```
subscribe() 
  → validates email & variant
  → creates subscription
  → sendAdminNotification()
     → transporter.sendMail('client-product-subscription-alert')
```

### 2. Producto Disponible
```
processBackInStock()
  → finds pending subscriptions
  → sendBackInStockNotifications()
     → transporter.sendMail('back-in-stock-alert') [para cada suscriptor]
  → sendAdminBackInStockNotification()
     → transporter.sendMail('back-in-stock-alert-admin')
  → marks subscriptions as notified
```

### 3. Desuscripción
```
unsubscribe()
  → finds and cancels subscription
  → updates status to CANCELLED
```

## Ventajas de esta Implementación

✅ **Separación de Responsabilidades**: Templates en archivos, lógica en código
✅ **Reutilizable**: Mismo template puede usarse en múltiples contextos
✅ **Mantenible**: Cambios en el diseño sin tocar código
✅ **Compatible**: Funciona con cualquier proveedor SMTP
✅ **Flexible**: Soporte para condicionales y loops en templates
✅ **Escalable**: Fácil agregar nuevos templates y eventos

## Proveedores SMTP Compatibles

- **Brevo** (predeterminado): `smtp-relay.brevo.com`
- **Mailgun**: `smtp.mailgun.org`
- **SendGrid**: `smtp.sendgrid.net`
- **AWS SES**: `email-smtp.region.amazonaws.com`
- **Gmail**: `smtp.gmail.com` (requiere app password)

## Troubleshooting

### Error: "Template not found"
Verifica que las plantillas estén en `views/emails/` con extensión `.handlebars`

### Error: "SMTP authentication failed"
Verifica las credenciales SMTP en variables de entorno

### Emails no enviándose
- Revisa los logs de console para ver errores
- Verifica que `ADMIN_EMAIL` esté configurado
- Comprueba la conexión SMTP con `telnet`

## Ejemplo de Uso

```typescript
const notifier = new ProductAlertNotifier(brevoEcommerceService);

// Enviar notificación de nueva suscripción
await notifier.sendAdminNotification(
  'customer@example.com',
  variant,
  product,
  'variant-id',
  true  // isNew
);
```

## Referencias

- [Nodemailer Documentation](https://nodemailer.com/)
- [nodemailer-express-handlebars](https://www.npmjs.com/package/nodemailer-express-handlebars)
- [Handlebars Guide](https://handlebarsjs.com/guide/)
