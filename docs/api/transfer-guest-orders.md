# `POST /admin/transfer-guest-orders`

Transfiere todas las órdenes de un guest customer (`has_account: false`) a un
customer registrado (`has_account: true`) con el mismo email.

---

## Tabla de contenidos

- [Caso de uso](#caso-de-uso)
- [Ruta](#ruta)
- [Autenticación](#autenticación)
- [Request body](#request-body)
- [Validation errors](#validation-errors)
- [Responses](#responses)
- [Diagrama de flujo](#diagrama-de-flujo)
- [Atomicidad](#atomicidad)
- [Diferencias con `register-guest-customer`](#diferencias-con-register-guest-customer)
- [Manejo de errores](#manejo-de-errores)

---

## Caso de uso

Un guest customer compra productos y genera órdenes en la tienda. Luego se
registra creando una cuenta en `/admin/register-guest-customer`. Ese endpoint
ya migra las órdenes automáticamente.

Sin embargo, existen dos escenarios que **`register-guest-customer` no cubre**:

1. **Customer ya registrado previamente** — el usuario ya tenía cuenta y se
   detectó que, por algún motivo, algunas órdenes quedaron asociadas a un guest
   con el mismo email.
2. **Migración en caliente** — se crearon órdenes como guest y el usuario se
   registró por otro medio (frontend store), sin invocar
   `register-guest-customer`.

Este endpoint permite gatillar la migración de órdenes _de forma separada_,
sin crear un nuevo customer y sin requerir password.

---

## Ruta

```
POST /admin/transfer-guest-orders
```

---

## Autenticación

El endpoint está bajo `/admin/`, por lo que Medusa aplica el middleware de
autenticación estándar de admin (`authenticate()`). Se requiere un `Cookie
connect.sid` o `Authorization: Bearer <token>` con una sesión de admin
válida. Sin autenticación devuelve `401 Unauthorized`.

---

## Request body

Content-Type: `application/json`

```json
{
  "email": "cliente@ejemplo.com"
}
```

### Schema

| Campo   | Tipo     | Requerido | Validación      |
| ------- | -------- | --------- | --------------- |
| `email` | `string` | **sí**    | `@IsEmail()`    |

---

## Validation errors

Si el body no pasa `class-validator`, se devuelve `400` con esta estructura:

```json
{
  "message": "Validation error",
  "errors": [
    {
      "property": "email",
      "constraints": { "isEmail": "email must be an email" }
    }
  ]
}
```

Campos extra en el body son ignorados (no hay `@Allow` ni whitelist).

---

## Responses

### ✅ `200 OK` — Órdenes transferidas

```json
{
  "message": "Órdenes transferidas exitosamente al cliente registrado.",
  "customer": "cliente@ejemplo.com",
  "customer_id": "cust_01ABCDEF...",
  "orders_transferred": 3
}
```

| Campo                 | Tipo     | Descripción                              |
| --------------------- | -------- | ---------------------------------------- |
| `message`             | string   | Descripción legible del resultado.       |
| `customer`            | string   | Email del customer registrado.           |
| `customer_id`         | string   | ID del customer registrado.              |
| `orders_transferred`  | number   | Cantidad de órdenes reasignadas (> 0).   |

### ❌ `400 Bad Request` — No existe registered customer

```json
{
  "message": "No existe un cliente registrado con este correo electrónico. Use /admin/register-guest-customer para registrar uno nuevo."
}
```

Causas posibles:

- El email no corresponde a ningún `Customer` con `has_account: true`.
- El email tiene solo un guest, pero nunca se registró.

### ❌ `404 Not Found` — No hay guest con órdenes

```json
{
  "message": "No se encontraron órdenes de guest para transferir con este correo electrónico.",
  "guestCustomerId": "cust_0GHIJKL...",
  "orders_transferred": 0
}
```

Posibles causas:

- No existe guest customer (`has_account: false`) para ese email.
- El guest existe pero no tiene ninguna orden asociada.

`guestCustomerId` es `null` si no se encontró guest, o el ID del guest si
existe pero no tiene órdenes.

### ⚠️ `500 Internal Server Error`

```json
{
  "message": "Error al transferir las órdenes del guest.",
  "detail": "Fallo en la conexión a la base de datos"
}
```

Causas posibles:

- Error de base de datos (FK violation, conexión caída).
- Error inesperado en `orderService.update` o `customerService.list`.

`detail` incluye el `error.message` original para facilitar debug.

---

## Diagrama de flujo

```
POST /admin/transfer-guest-orders { email }
        │
        ▼
  class-validator ──> 400 si email inválido
        │
        ▼
  Buscar Customer con { email, has_account: true }
        │
        ├── No encontrado ──> 400
        │
        ▼ (encontrado)
  ┌──────────────────────────────────────────────┐
  │  TRANSACCIÓN TypeORM                          │
  │  manager.transaction(...)                     │
  │                                               │
  │  Buscar Customer con { email, has_account:    │
  │    false }                                    │
  │     │                                         │
  │     ├── No encontrado ──> return (0, false)   │
  │     │                                         │
  │     ▼ (encontrado)                            │
  │  Buscar Order con { customer_id: guest.id }   │
  │     │                                         │
  │     ├── 0 orders ──> return (0, false)        │
  │     │                                         │
  │     ▼ (N orders)                              │
  │  for each order:                              │
  │    orderService.update(order.id,               │
  │      { customer_id: registered.id })          │
  │     │                                         │
  │  ──> Si algún update falla: TRANSACTION ROLLBACK │
  │  ──> Si todos OK: COMMIT                      │
  └──────────────────────────────────────────────┘
        │
        ▼
  result.ordersTransferred > 0 ?
        │
        ├── Sí ──> 200 OK
        │
        └── No ──> 404 Not Found
```

---

## Atomicidad

Toda la operación (listado de guests, reasignación de órdenes) se ejecuta
dentro de una transacción TypeORM usando:

```ts
const manager: EntityManager = scope.resolve("manager");
return await manager.transaction(async (transactionManager) => { ... });
```

Los servicios `CustomerService` y `OrderService` se instancian con
`withTransaction(transactionManager)` para que todas las queries compartan el
mismo contexto transaccional.

**Garantías:**

- Si falla cualquier `orderService.update`, se hace rollback completo del
  bloque. Ninguna orden queda reasignada parcialmente.
- Si la operación completa es exitosa, se hace commit de todas las
  reasignaciones en una sola transacción atómica.

**Limitación:** La eliminación del guest (`deleteGuest`) no se ejecuta en este
endpoint (se pasa `deleteGuest: false` al helper siempre). Si en el futuro se
quisiera eliminar el guest, esa operación también estaría dentro de la misma
transacción.

---

## Diferencias con `register-guest-customer`

| Aspecto                | `register-guest-customer` | `transfer-guest-orders` |
| ---------------------- | ------------------------- | ----------------------- |
| Crea customer          | Sí                        | No                      |
| Requiere `password`    | Sí                        | No                      |
| Elimina guest          | Sí (por defecto)          | No                      |
| Requiere registered    | No (lo crea si falta)     | Sí                      |
| Flag `delete_guest`    | Sí (`@IsBoolean`)         | N/A                     |
| Retorna `customer`     | Email                      | Email + ID              |
| Transacción            | Sí (helper compartido)    | Sí (helper compartido)  |

Ambos endpoints comparten el mismo helper interno
(`transferOrdersFromGuestToCustomer`), por lo que cualquier mejora
(transaccionalidad, batch updates, etc.) se refleja en los dos
automáticamente.

---

## Manejo de errores

| Código | Condición                                                     | Recuperación                                        |
| ------ | ------------------------------------------------------------- | --------------------------------------------------- |
| 400    | Email inválido en el body                                     | Corregir el request body.                           |
| 400    | No existe customer registrado con ese email                   | Usar `register-guest-customer` si corresponde.      |
| 404    | No hay guest con órdenes para ese email                       | Verificar que el email es correcto.                 |
| 500    | Error interno (base de datos, conexión, etc.)                 | Reintentar; si persiste, revisar logs del servidor. |

En caso de `500`, la transacción asegura que no haya cambios parciales, por lo
que reintentar la operación es seguro.
