# E2E Testing Architecture - Product Alert Emails

Descripción arquitectónica de cómo los E2E tests interactúan con el sistema de alertas de productos.

## 🏗️ Arquitectura General

```
┌─────────────────────────────────────────────────────────────┐
│                    E2E Test Suite                           │
│                   (e2e/smtp/)                               │
└────────────────┬────────────────────────────────────────────┘
                 │
        ┌────────┴────────┬─────────────┬──────────────┐
        │                 │             │              │
   ┌────▼──┐         ┌────▼───┐   ┌────▼────┐  ┌────▼──┐
   │ Mocks │         │ Config  │   │ Tests   │  │ Utils │
   │mocks  │         │smtp-cfg │   │ Sender  │  │ Logs  │
   └────────┘        └─────────┘   └─────────┘  └───────┘
        │                                           │
        └───────────────────┬──────────────────────┘
                            │
        ┌───────────────────▼──────────────────────┐
        │  Nodemailer Transporter                 │
        │  (createTransporter)                    │
        └───────────────────┬──────────────────────┘
                            │
        ┌───────────────────▼──────────────────────┐
        │  Handlebars Template Engine             │
        │  (nodemailer-express-handlebars)       │
        └───────────────────┬──────────────────────┘
                            │
        ┌───────────────────▼──────────────────────┐
        │  Template Files (.handlebars)           │
        │  /src/templates/emails/                │
        └───────────────────┬──────────────────────┘
                            │
        ┌───────────────────▼──────────────────────┐
        │  SMTP Provider                          │
        │  (Brevo, Mailgun, SendGrid, etc)      │
        └────────────────────────────────────────┘
                            │
        ┌───────────────────▼──────────────────────┐
        │  Email Client Inbox                     │
        │  (verificación manual)                 │
        └────────────────────────────────────────┘
```

## 📂 Estructura de Archivos

### E2E Test Directory (`e2e/smtp/`)

```
e2e/smtp/
├── test-email-sending.mjs      # Script principal de pruebas
│   ├── Validación de config
│   ├── Creación de transporter
│   ├── Ejecución de tests (4 escenarios)
│   └── Reportes de resultados
│
├── mocks.mjs                   # Datos de prueba
│   ├── mockProductVariant      # Variante de producto
│   ├── mockProduct             # Producto
│   ├── mockSubscriber(s)       # Cliente(s) suscriptor(es)
│   └── Context objects para cada template
│
├── smtp-config.mjs             # Configuración SMTP
│   ├── smtpConfig              # Credenciales SMTP
│   ├── emailConfig             # Email from, admin, URL
│   ├── validateSmtpConfig()    # Validación
│   └── printSmtpConfig()       # Logging
│
├── README.md                   # Documentación completa
├── QUICKSTART.md              # Guía de inicio rápido
├── example.env                # Variables de entorno ejemplo
└── TESTING_ARCHITECTURE.md    # Este archivo
```

### Template Files (`src/templates/emails/`)

```
src/templates/emails/
├── back-in-stock-alert.handlebars
│   ├── Variantes: {{product_name}}, {{product_price}}
│   ├── Loops: N/A
│   ├── Partials: {{> footer}}
│   └── Condicionales: {{#if product_image}}, {{#if product_price}}
│
├── back-in-stock-alert-admin.handlebars
│   ├── Variantes: {{subscribers_count}}, {{variant_title}}
│   ├── Loops: {{#each subscribers}}
│   ├── Partials: {{> footer}}
│   └── Condicionales: {{#if image_url}}
│
└── client-product-subscription-alert.handlebars
    ├── Variantes: {{subscriber_email}}, {{variant_title}}
    ├── Loops: N/A
    ├── Partials: {{> footer}}
    └── Condicionales: {{#if is_new}}
```

### Partial Files (`src/templates/partials/`)

```
src/templates/partials/
└── footer.handlebars
    ├── Variables: {{unsubscribe_url}}, {{current_year}}
    ├── Optimizado: ~20% menos espacio
    └── Reutilizable: Usado en 3 templates
```

## 🔄 Flujo de Ejecución

### Paso 1: Validación de Configuración

```
test-email-sending.mjs
        │
        ├─→ Importar smtp-config.mjs
        │
        ├─→ validateSmtpConfig()
        │   ├─ Verificar SMTP_USER
        │   ├─ Verificar SMTP_PASS
        │   ├─ Verificar ADMIN_EMAIL
        │   └─ Retornar true/false
        │
        └─→ Mostrar printSmtpConfig() (sin contraseñas)
```

### Paso 2: Creación de Transporter

```
createTransporter()
        │
        ├─ nodemailer.createTransport({
        │    host, port, secure, auth
        │  })
        │
        ├─ Configurar Handlebars con:
        │  ├─ partialsDir: /src/templates/partials/
        │  ├─ viewPath: /src/templates/emails/
        │  └─ extName: .handlebars
        │
        ├─ transporter.use('compile', hbs(options))
        │
        └─ Return transporter
```

### Paso 3: Prueba de Conexión

```
transporter.verify()
        │
        ├─ Conectar al SMTP
        ├─ Autenticar con credenciales
        ├─ Confirmar que está listo
        └─ Return true/false
```

### Paso 4: Tests de Email Sending

Para cada test:

```
testEmailType()
    │
    ├─ Importar contexto mock
    │
    ├─ Preparar mailOptions:
    │  ├─ from: SMTP_FROM
    │  ├─ to: destinatario
    │  ├─ subject: asunto
    │  ├─ template: nombre_template.handlebars
    │  └─ context: {variables}
    │
    ├─ transporter.sendMail(mailOptions)
    │  ├─ Resolver path del template
    │  ├─ Compilar Handlebars con context
    │  ├─ Renderizar HTML final
    │  └─ Enviar vía SMTP
    │
    └─ Retornar success/failure
```

## 📊 Los 4 Tests

### Test 1: back-in-stock-alert (Cliente)

**Propósito**: Verificar que clientes reciben notificación cuando producto vuelve a estar disponible

**Flujo**:
```
mockSubscriber.email             ← Destino
backInStockAlertContext           ← Variables
back-in-stock-alert.handlebars    ← Template
        │
        └─→ Renderizar con:
            - product_name
            - product_url
            - product_image
            - product_price
            - variant_sku
            - unsubscribe_url
            - current_year
        │
        └─→ Enviar email
```

**Esperado**: Email llega a `cliente@example.com` (mock)

### Test 2: back-in-stock-alert-admin

**Propósito**: Verificar confirmación a admin del envío masivo de notificaciones

**Flujo**:
```
emailConfig.adminEmail            ← Destino
backInStockAlertAdminContext      ← Variables
back-in-stock-alert-admin.html    ← Template
        │
        └─→ Renderizar con:
            - subscribers_count
            - image_url
            - variant_title
            - product_url
            - subscribers (array)
              └─ {{#each}} loop
            - current_year
        │
        └─→ Enviar email
```

**Esperado**: Email llega a admin@cartago4x4.com

### Test 3a: subscription-alert Nueva

**Propósito**: Notificar admin cuando cliente se suscribe a un producto

**Flujo**:
```
emailConfig.adminEmail                      ← Destino
clientProductSubscriptionAlertNewContext    ← Variables
client-product-subscription-alert.html      ← Template
        │
        └─→ Renderizar con:
            - is_new: true (muestra "Nueva")
            - subscriber_email
            - image_url
            - variant_title
            - product_sku
            - product_url
            - current_year
        │
        └─→ Enviar email
```

**Esperado**: Email llega a admin@cartago4x4.com

### Test 3b: subscription-alert Reactivada

**Propósito**: Notificar admin cuando cliente reactiva una suscripción

**Flujo**:
```
emailConfig.adminEmail                           ← Destino
clientProductSubscriptionAlertReactivatedContext ← Variables
client-product-subscription-alert.html           ← Template
        │
        └─→ Renderizar con:
            - is_new: false (muestra "Reactivada")
            - subscriber_email
            - image_url
            - variant_title
            - product_sku
            - product_url
            - current_year
        │
        └─→ Enviar email
```

**Esperado**: Email llega a admin@cartago4x4.com

## 🔗 Integración con ProductAlertService

Los E2E tests usan el mismo código que `src/services/product-alert.ts`:

### Clase `NodemailerTransporterFactory`

**Ubicación**: `src/services/product-alert.ts` + `e2e/smtp/test-email-sending.mjs`

**Método**: `createTransporter()`
```typescript
static createTransporter(): nodemailer.Transporter {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true" || false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const handlebarsOptions = {
    viewEngine: {
      partialsDir: path.join(__dirname, "../templates/partials/"),
      defaultLayout: false,
    },
    viewPath: path.join(__dirname, "../templates/emails/"),
    extName: ".handlebars",
  };

  transporter.use("compile", hbs(handlebarsOptions));
  return transporter;
}
```

### Clase `ProductAlertNotifier`

**Métodos usados en E2E**:

1. `sendAdminNotification()` - Test 3a/3b
2. `sendBackInStockNotifications()` - Test 1
3. `sendAdminBackInStockNotification()` - Test 2

**Cada método**:
- Crea transporter vía `NodemailerTransporterFactory`
- Prepara `mailOptions` con template y context
- Ejecuta `transporter.sendMail()`

## 🧪 Variables de Entorno Requeridas

### En `.env` (proyecto)

```env
# SMTP
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu_email@brevo.com
SMTP_PASS=tu_api_key

# Emails
SMTP_FROM=noreply@cartago4x4.com
ADMIN_EMAIL=admin@cartago4x4.com
STORE_URL=https://cartago4x4.com
```

### En `mocks.mjs` (hardcoded para testing)

```javascript
mockSubscriber.email      = "cliente@example.com"
mockSubscribers           = 4 emails de prueba
STORE_URL (en contexto)   = "https://cartago4x4.com"
```

## ✅ Validaciones

### 1. Validación de Configuración

```javascript
validateSmtpConfig() {
  ✓ SMTP_USER existe
  ✓ SMTP_PASS existe
  ✓ ADMIN_EMAIL existe
  → Si falta algo: Error con lista de variables esperadas
}
```

### 2. Validación de Conexión SMTP

```javascript
transporter.verify() {
  ✓ Puede conectar al host SMTP
  ✓ Autenticación funciona
  ✓ Servidor está listo para enviar
  → Si falla: Error específico del servidor
}
```

### 3. Validación de Template Rendering

```javascript
transporter.sendMail() {
  ✓ Template file existe
  ✓ Handlebars compila sin errores
  ✓ Context variables están disponibles
  ✓ HTML final se genera correctamente
  → Si falla: Error de compilación/rendering
}
```

### 4. Validación de Envío

```javascript
transporter.sendMail() {
  ✓ SMTP acepta el email
  ✓ Mensaje tiene Message ID
  ✓ Servidor responde con código 250
  → Si falla: Error del servidor SMTP
}
```

## 🔍 Debugging

### Logs en Test

El script imprime:
- ✅ Validaciones pasadas
- ❌ Errores detectados
- 📧 Detalles del email (destinatario, template, contexto)
- 📤 Message ID después de envío
- 📊 Resumen final

### Logs en Desarrollo

Para logging adicional:

```javascript
// En test-email-sending.mjs
console.log('DEBUG:', {
  transporter: transporter,
  context: backInStockAlertContext,
  mailOptions: mailOptions,
  response: info,
});
```

### Debugging de Templates

Para ver HTML generado:

```javascript
// Modificar sendMail() temporalmente para loguear
const { html } = await new Promise((resolve, reject) => {
  transporter.render(mailOptions, (err, html) => {
    if (err) reject(err);
    else resolve({ html });
  });
});
console.log('Generated HTML:', html);
```

## 🚀 Deployment a Producción

### Cambios necesarios en ProductAlertService

1. **Usar NodemailerTransporterFactory**: Ya está implementado
2. **Variables .env producción**: Configurar en servidor
3. **Templates**: Copiar `/src/templates/emails/` a producción
4. **Monitoreo**: Implementar logging de envíos

### Cambios opcionales

1. **Usar cola de tareas**: Para envíos asincronos
2. **Implementar retry logic**: En caso de fallo temporal
3. **Logging centralizado**: Sentry, LogRocket, etc.
4. **Rate limiting**: Para evitar abuse

## 📚 Referencias

- [ProductAlertService](../src/services/product-alert.ts)
- [Nodemailer Docs](https://nodemailer.com/)
- [Handlebars Guide](https://handlebarsjs.com/)
- [E2E Testing Best Practices](./README.md)

## 🎯 Próximos pasos

1. ✅ Ejecutar tests localmente
2. ✅ Validar que emails llegan correctamente
3. ✅ Revisar formato y contenido
4. ✅ Configurar en staging
5. ✅ Configurar en producción
6. ✅ Monitorear métricas de email
