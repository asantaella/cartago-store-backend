# 🚀 Quick Start - E2E SMTP Tests

Guía rápida para comenzar con los tests de emails.

## 1️⃣ Copiar variables de entorno

```bash
cp e2e/smtp/example.env .env
```

## 2️⃣ Configurar credenciales SMTP

Edita `.env` con tus credenciales SMTP. Si usas Brevo:

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu_email@brevo.com
SMTP_PASS=tu_api_key
SMTP_FROM=noreply@cartago4x4.com
ADMIN_EMAIL=admin@cartago4x4.com
STORE_URL=https://cartago4x4.com
```

## 3️⃣ Ejecutar tests

```bash
node e2e/smtp/test-email-sending.mjs
```

## 4️⃣ Verificar resultados

✅ Si todos los tests pasan:
- Revisa tus emails en las direcciones configuradas
- Verifica que aparezcan correctamente formateados
- Revisa la carpeta de Spam si no los ves en Inbox

❌ Si hay errores:
- Verifica las credenciales SMTP
- Chequea que el firewall permita conexiones salientes
- Revisa los logs del proveedor SMTP

## 📧 Emails de prueba se envían a:

- **Cliente**: `juan@ejemplo.com` (de mocks.mjs)
- **Admin**: `admin@cartago4x4.com` (de tu .env)

Para cambiar emails en las pruebas, edita `e2e/smtp/mocks.mjs` e `e2e/smtp/smtp-config.mjs`

## 🔧 Modificar datos de prueba

Todos los datos de prueba están en `mocks.mjs`. Puedes cambiar:

- Nombre del producto
- Email del cliente
- Información del producto
- URLs
- etc.

```javascript
export const mockSubscriber = {
  id: "sub_test_001",
  email: "tu_email@ejemplo.com",  // ← Cambiar aquí
  // ...
};
```

## � Dependencias requeridas

Asegúrate de tener instaladas las dependencias:

```bash
npm install nodemailer nodemailer-express-handlebars handlebars express-handlebars --legacy-peer-deps
```

## 1️⃣ Copiar variables de entorno

- Los tests NO borran datos reales (solo se envían emails)
- Usa `SMTP_FROM` verificado en tu proveedor
- Configura SPF/DKIM para mejor deliverability
- Monitorea tu cuota de emails en el proveedor

## 🆘 Problemas comunes

**Error: "SMTP_USER no está configurado"**
→ Copia example.env a .env y configura las variables

**Error: "Invalid login"**
→ Verifica usuario y contraseña SMTP

**Los emails no llegan**
→ Revisa Spam, configura SPF/DKIM, usa sender verificado

Para más ayuda, ver sección Troubleshooting en README.md
