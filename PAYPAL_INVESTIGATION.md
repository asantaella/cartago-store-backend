# ANÁLISIS DEL PROBLEMA: PayPal AUTHORIZE Flow Webhook No Completa el Cart

## RESUMEN EJECUTIVO

El webhook de PayPal **SÍ llega** a Medusa (confirmado por ngrok logs con 409 Conflict), pero el plugin no puede procesar la autorización porque:

**El Authorization ID que PayPal envía en el webhook NO COINCIDE con el Authorization ID que retorna la API `authorize()`**

## EVIDENCIA

### 1. El Plugin Intenta Recuperar la Autorización
```
GET /v2/payments/authorizations/8UM36345TT6665637  → 404 Not Found
```

Este Authorization ID es el que retorna `authorizeOrder()`.

### 2. PayPal Retorna 404
Esto significa que PayPal Sandbox NO tiene registro de una autorización con ese ID.

### 3. Esto Ocurre Solo en AUTHORIZE Flow
- **CAPTURE flow** (capture: true): El API de capture retorna un capture ID que existe inmediatamente en PayPal
- **AUTHORIZE flow** (capture: false): El API de authorize retorna un authorization ID que podría NO estar registrado en PayPal Sandbox

## CAUSA RAÍZ PROBABLES

### Hipótesis 1: Webhook Enviando Diferente Authorization ID
PayPal Sandbox genera un Authorization ID INTERNO cuando procesa el webhook, diferente al que retorna nuestra llamada API.

**Solución**: Ver qué Authorization ID está en el webhook usando el script debug:
```bash
node scripts/payments/paypal-webhook-server.mjs
```

### Hipótesis 2: El Webhook NO Contiene Authorization ID
Si el webhook de `PAYMENT.AUTHORIZATION.CREATED` no contiene `resource.id`, el plugin no puede recuperar la autorización.

**Solución**: Revisar la estructura del webhook payload.

### Hipótesis 3: Problema de Configuración del Webhook en PayPal
El webhook está configurado para el tipo incorrecto de evento, o no se está enviando correctamente.

**Solución**: Verificar que el webhook en PayPal Developer está configurado para:
- Event: `PAYMENT.AUTHORIZATION.CREATED` (NOT `Payment authorization created`)
- URL: `https://[ngrok-url]/hooks/payment/paypal_paypal`

## FLUJO CORRECTO (TEÓRICO)

```
1. Ejecutar authorizeOrder(orderId)
   ↓
2. PayPal retorna: { purchase_units[0].payments.authorizations[0].id: "AUTH_ID_1" }
   ↓
3. Nuestro script registra: "Authorization ID del API: AUTH_ID_1"
   ↓
4. PayPal Sandbox envía webhook PAYMENT.AUTHORIZATION.CREATED
   - Con resource.id = "AUTH_ID_1" (idealmente)
   - O con resource.id = "AUTH_ID_2" (diferente)
   ↓
5. Plugin recibe webhook
   ↓
6. Plugin intenta: GET /v2/payments/authorizations/{resource.id}
   - Si exists → 200 OK → Plugin completa cart
   - Si no exists → 404 Not Found → Plugin falla (409 Conflict a ngrok)
```

## PRÓXIMOS PASOS PARA INVESTIGAR

### Paso 1: Ejecutar Script Debug Webhook
```bash
# Terminal 1: Inicia el servidor debug
node scripts/payments/paypal-webhook-server.mjs

# Terminal 2: Configura ngrok para apuntar a localhost:9001
ngrok http 9001

# Terminal 3: Actualiza la URL del webhook en PayPal Developer
# Con la URL de ngrok que te dé (ej: https://xxxx.ngrok-free.dev)

# Terminal 4: Ejecuta el test
node scripts/payments/test-paypal.mjs
```

### Paso 2: Observa el Authorization ID en el Webhook
El servidor debug mostrará exactamente:
```
🎯 DATOS CRÍTICOS EXTRAÍDOS:
  Event Type: PAYMENT.AUTHORIZATION.CREATED
  Resource ID (Authorization ID): ???
  Status: CREATED
```

### Paso 3: Compara con el Authorization ID del API
- Si coinciden: El problema es que PayPal Sandbox no registra la autorización hasta después
- Si NO coinciden: PayPal está enviando un ID diferente

## SI LOS IDs NO COINCIDEN

Esto indicaría un **BUG en v1.20.11 del plugin medusa-payment-paypal**.

La solución sería:
1. Actualizar a una versión más reciente del plugin (si está disponible)
2. O parchear el plugin localmente para manejar el Authorization ID diferente
3. O cambiar a usar CAPTURE flow en lugar de AUTHORIZE

## SI LOS IDs COINCIDEN PERO PAYPAL RETORNA 404

Esto significa:
1. PayPal Sandbox tiene un delay antes de hacer que la autorización sea recuperable
2. El plugin necesita esperar más tiempo antes de intentar recuperar
3. O hay un problema de permisos/credenciales con el acceso a la autorización

## CONFIGURACIÓN ACTUAL

- **Plugin**: medusa-payment-paypal
- **Config capture**: false (AUTHORIZE flow)
- **Webhook**: Esperando PAYMENT.AUTHORIZATION.CREATED via ngrok
- **Resultado actual**: 409 Conflict (webhook llega pero falla al procesar)
