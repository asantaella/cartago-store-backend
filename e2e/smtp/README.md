# E2E SMTP Tests - Product Alert Emails

Pruebas end-to-end para validar el envío de emails de notificación de disponibilidad de productos utilizando Nodemailer + Handlebars.

## 📋 Descripción

Este conjunto de scripts automatiza el testing de los tres tipos de emails del sistema de alertas de productos:

1. **back-in-stock-alert**: Notificación al cliente cuando un producto vuelve a estar disponible
2. **back-in-stock-alert-admin**: Confirmación al admin del envío de notificaciones en bulk
3. **client-product-subscription-alert**: Notificación al admin cuando un cliente se suscribe o reactiva una suscripción

## 🏗️ Estructura

```
e2e/smtp/
├── README.md                      # Este archivo
├── test-email-sending.mjs         # Script principal de testing
├── mocks.mjs                      # Datos de prueba (productos, suscriptores, contextos)
├── smtp-config.mjs                # Configuración SMTP y validación
└── example.env                    # Ejemplo de variables de entorno
```

## 📦 Requisitos

### Node.js
- **Node.js**: v16 o superior (por soporte de ES modules)

### Dependencias
```bash
npm install nodemailer nodemailer-express-handlebars handlebars express-handlebars --legacy-peer-deps
```

## 🔐 Configuración

### 1. Variables de entorno (.env)

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
# SMTP Configuration
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu_email@ejemplo.com
SMTP_PASS=tu_contraseña_smtp

# Email Configuration
SMTP_FROM=noreply@cartago4x4.com
ADMIN_EMAIL=admin@cartago4x4.com
STORE_URL=https://cartago4x4.com

# Optional: Para testing con otros proveedores
# SMTP_HOST=smtp.mailgun.org
# SMTP_HOST=smtp.sendgrid.net
# SMTP_HOST=email-smtp.us-east-1.amazonaws.com
```

### 2. Proveedores SMTP soportados

El script funciona con cualquier proveedor SMTP compatible. Configuraciones típicas:

**Brevo (Por defecto)**
```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu_email@brevo.com
SMTP_PASS=tu_api_key_smtp
```

**Mailgun**
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@sandboxxxxxxx.mailgun.org
SMTP_PASS=tu_password
```

**SendGrid**
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=SG.xxxxxxxxxxxxx
```

**AWS SES**
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu_smtp_username
SMTP_PASS=tu_smtp_password
```

**Gmail**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu_email@gmail.com
SMTP_PASS=tu_contraseña_app_específica
```

## 🚀 Uso

### Ejecutar todos los tests

```bash
node e2e/smtp/test-email-sending.mjs
```

### Ejecutar solo dentro del contenedor

Si estás desarrollando en Docker:

```bash
docker-compose exec backend node e2e/smtp/test-email-sending.mjs
```

## 📊 Output esperado

El script producirá un output detallado como este:

```
============================================================
  🧪 E2E Test: Product Alert Emails
============================================================

🔐 SMTP Configuration Validation
Validación de configuración...
✅ SMTP_USER configurado
✅ SMTP_PASS configurado
✅ ADMIN_EMAIL configurado

📋 SMTP Configuration Details
- Host: smtp-relay.brevo.com
- Port: 587
- Secure: false
- From: noreply@cartago4x4.com
- Admin Email: admin@cartago4x4.com

🔧 Creando transporter Nodemailer...
✅ Transporter creado correctamente

🔗 Verificando conexión SMTP...
✅ Conexión SMTP verificada correctamente

============================================================
📌 Test 1: back-in-stock-alert (Cliente)
------------------------------------------------------------

📧 Enviando notificación a cliente...

Datos:
  - Destinatario: juan@ejemplo.com
  - Producto: Ruedas de Aleación 18" - ORO
  - SKU: RD-18-GOLD-001
  - Precio: €459.90
  - Template: back-in-stock-alert

📤 Enviando email...
✅ Email enviado exitosamente
  - Message ID: <...>
  - Response: 250 Message queued

...

📊 Resumen de Resultados
============================================================

Tests ejecutados: 4
Tests pasados: 4
Tests fallidos: 0

Detalle:
  ✅ Test 1: back-in-stock-alert (Cliente)
  ✅ Test 2: back-in-stock-alert-admin (Admin)
  ✅ Test 3a: subscription-alert Nueva (Admin)
  ✅ Test 3b: subscription-alert Reactivada (Admin)

💡 Próximos pasos:
  1. Revisa tu email (y carpeta de spam) en:
     - Cliente: juan@ejemplo.com
     - Admin: admin@cartago4x4.com
  2. Verifica que los emails se vieron correctamente
  3. Prueba en producción si todos los tests pasan

✅ ¡Todos los tests pasaron! 🎉
```

## 📧 Datos de prueba (mocks.mjs)

Los tests utilizan datos ficticios definidos en `mocks.mjs`:

### Producto
```javascript
{
  id: "prod_test_001",
  title: "Ruedas Cartago - Nueva Generación",
  handle: "ruedas-aleacion",
  thumbnail: "https://...",
  images: [...]
}
```

### Variante
```javascript
{
  id: "var_test_001",
  title: "Ruedas de Aleación 18\" - ORO",
  sku: "RD-18-GOLD-001",
  inventory_quantity: 50,
  prices: [
    { currency_code: "eur", amount: 45990 }
  ]
}
```

### Suscriptores
```javascript
[
  { id: "sub_1", email: "juan@ejemplo.com", ... },
  { id: "sub_2", email: "maria@ejemplo.com", ... },
  { id: "sub_3", email: "pedro@ejemplo.com", ... },
  { id: "sub_4", email: "diana@ejemplo.com", ... }
]
```

Todos los datos se pueden modificar en `mocks.mjs` para adaptarse a tu testing.

## 🧪 Qué se prueba

### Test 1: Back-in-stock-alert (Cliente)
- **Plantilla**: `back-in-stock-alert.handlebars`
- **Destinatario**: Cliente suscriptor
- **Variables probadas**:
  - Nombre del producto
  - URL del producto
  - Imagen del producto
  - Precio
  - SKU
  - URL para desuscribirse
  - Año actual

### Test 2: Back-in-stock-alert-admin
- **Plantilla**: `back-in-stock-alert-admin.handlebars`
- **Destinatario**: Admin
- **Variables probadas**:
  - Cantidad de suscriptores notificados
  - Listado de emails de suscriptores (loop {{#each}})
  - Detalles del producto
  - URL del producto

### Test 3a: Subscription-alert (Nueva)
- **Plantilla**: `client-product-subscription-alert.handlebars`
- **Destinatario**: Admin
- **Variables probadas**:
  - Flag `is_new: true` (muestra "Nueva suscripción")
  - Email del suscriptor
  - Imagen del producto
  - Título de variante
  - SKU del producto
  - Año actual

### Test 3b: Subscription-alert (Reactivada)
- **Plantilla**: `client-product-subscription-alert.handlebars`
- **Destinatario**: Admin
- **Variables probadas**:
  - Flag `is_new: false` (muestra "Suscripción reactivada")
  - Email del suscriptor
  - Imagen del producto
  - Título de variante
  - SKU del producto
  - Año actual

## 🔍 Troubleshooting

### "❌ SMTP_USER no está configurado"
**Solución**: Asegúrate de tener las variables de entorno correctamente configuradas en tu archivo `.env`

```bash
cat .env | grep SMTP
```

### "❌ Error al verificar SMTP: connect ECONNREFUSED"
**Solución**: El host SMTP no es accesible. Verifica:
- El nombre del host SMTP es correcto
- Tu firewall permite conexiones salientes en el puerto SMTP (587 o 465)
- Las credenciales SMTP son válidas

### "❌ Error al verificar SMTP: Invalid login"
**Solución**: Las credenciales SMTP son incorrectas:
- Verifica `SMTP_USER` y `SMTP_PASS`
- Algunos proveedores requieren API keys específicas
- Revisa que no haya espacios al inicio/fin

### Los emails no llegan a la bandeja
**Soluciones**:
1. Revisa la carpeta de Spam
2. Configura SPF, DKIM y DMARC para tu dominio
3. Usa una dirección `SMTP_FROM` verificada en tu proveedor
4. Verifica los logs de tu proveedor de email

### "⚠️ Template file not found"
**Solución**: Las plantillas Handlebars deben estar en `/views/emails/`:
```bash
ls -la /views/emails/
# Debe mostrar:
# - back-in-stock-alert.handlebars
# - back-in-stock-alert-admin.handlebars
# - client-product-subscription-alert.handlebars
```

## 📚 Recursos adicionales

- [Nodemailer Documentation](https://nodemailer.com/)
- [Handlebars Template Syntax](https://handlebarsjs.com/guide/)
- [nodemailer-express-handlebars](https://www.npmjs.com/package/nodemailer-express-handlebars)

## ✅ Checklist pre-producción

Antes de deploying a producción:

- [ ] Tests pasan correctamente en local
- [ ] Variables de entorno configuradas en servidor
- [ ] Emails llegan a bandeja principal (no spam)
- [ ] Links en emails funcionan correctamente
- [ ] Imágenes se cargan correctamente
- [ ] Responsive design se ve bien en mobile
- [ ] SPF/DKIM/DMARC configurados en DNS
- [ ] Rate limiting configurado en provider SMTP
- [ ] Monitoreo de bounces/unsubscribes activo
- [ ] Documentación actualizada para el equipo

## 🤝 Contribuciones

Para agregar nuevos tests o mejorar los existentes:

1. Modifica `mocks.mjs` para agregar nuevos datos
2. Actualiza `test-email-sending.mjs` con nuevas funciones de test
3. Ejecuta los tests para validar

## 📝 Licencia

Parte del proyecto Cartago Store Backend
