# Configuración SMTP para Railway (Producción)

## Problema
Railway y algunos entornos de producción pueden tener restricciones en las conexiones SMTP salientes, causando timeouts como:
```
Error: Connection timeout
code: 'ETIMEDOUT', command: 'CONN'
```

## Soluciones Implementadas

### 1. Pool de Conexiones
Se usa `pool: true` para conexiones persistentes que mejoran la estabilidad en producción.

### 2. Timeouts Extendidos
- `connectionTimeout: 120000` (2 minutos)
- `greetingTimeout: 30000` (30 segundos)
- `socketTimeout: 120000` (2 minutos)

### 3. Reintentos Automáticos
El sistema reintenta hasta 3 veces con delays incrementales (2s, 4s, 6s) antes de fallar.

### 4. Verificación de Conexión
Al iniciar, se verifica que el servidor SMTP esté accesible.

## Variables de Entorno Requeridas

### Configuración Básica (Obligatoria)
```bash
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587                    # O 465 para TLS
SMTP_USER=your-email@example.com
SMTP_PASS=your-smtp-key
SMTP_FROM=noreply@yourdomain.com
SMTP_SENDER="Your Store Name"
```

### Configuración Avanzada (Opcional)

#### Para usar puerto 465 con TLS (más estable en algunos entornos)
```bash
SMTP_PORT=465
SMTP_SECURE=true
```

#### Para debugging en producción
```bash
SMTP_DEBUG=true
```

#### Para entornos con certificados autofirmados
```bash
SMTP_TLS_REJECT_UNAUTHORIZED=false
```

## Configuración en Railway

1. **Ir a tu proyecto en Railway**
2. **Seleccionar tu servicio**
3. **Variables → RAW Editor**
4. **Agregar las variables:**

```env
# SMTP Configuration
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=tu-email@ejemplo.com
SMTP_PASS=tu-clave-smtp-de-brevo
SMTP_FROM=equipo@cartago4x4.es
SMTP_SENDER=Cartago4x4

# Admin Email
ADMIN_EMAIL=admin@cartago4x4.es

# Store URL
STORE_URL=https://cartago4x4.es
```

## Alternativas si Persiste el Problema

### Opción 1: Usar Puerto 465 (TLS Directo)
Algunos proveedores de hosting bloquean el puerto 587 pero permiten 465:

```env
SMTP_PORT=465
SMTP_SECURE=true
```

### Opción 2: Usar un Servicio de Email API
Si SMTP continúa bloqueado, considera usar la API de Brevo en lugar de SMTP:

```bash
# Instalar SDK de Brevo
npm install @getbrevo/brevo
```

Y modificar el código para usar la API REST en lugar de SMTP.

### Opción 3: Verificar con Railway Support
Railway puede tener políticas específicas sobre SMTP. Contactar su soporte para:
- Verificar si hay restricciones de puerto
- Solicitar whitelist si es necesario
- Confirmar que las conexiones salientes están permitidas

## Testing Local vs Producción

### Local (Funciona)
- Red doméstica/universitaria generalmente permite SMTP
- Timeouts más cortos son suficientes
- Menos restricciones de firewall

### Railway/Producción (Puede Fallar)
- Restricciones de red más estrictas
- Posibles bloqueos de puertos
- IPs compartidas que pueden estar en listas negras
- Requiere timeouts más largos

## Verificación de Conectividad

Para verificar que Railway puede conectar con Brevo SMTP:

```bash
# En Railway Shell
telnet smtp-relay.brevo.com 587
# o
nc -zv smtp-relay.brevo.com 587
```

Si falla, confirma que Railway permite conexiones salientes en ese puerto.

## Logs para Debugging

Activa el debugging SMTP en Railway:

```env
SMTP_DEBUG=true
```

Esto mostrará logs detallados de la comunicación SMTP para identificar dónde falla exactamente.

## Consideraciones de Seguridad

1. **Nunca** commits credenciales SMTP en el código
2. Usa variables de entorno en Railway
3. Rota las claves SMTP periódicamente
4. Monitorea los logs para detectar intentos de abuso

## Monitoreo

Los logs del sistema ahora incluyen:
- Intentos de conexión con configuración sanitizada
- Intentos de reenvío (1/3, 2/3, 3/3)
- Errores específicos con contexto
- Verificación de conectividad al inicio

Busca en los logs:
- `[ProductAlertService] Creating SMTP transporter with config`
- `[ProductAlertService] SMTP server is ready to send emails`
- `[ProductAlertNotifier] ... - Attempt X/3`
