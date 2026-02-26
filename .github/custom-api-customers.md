<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Detallar la opción 1, en formato optimizado para agent LLM

A continuación tienes la **Opción 1** detallada y estructurada para que un agent LLM pueda implementarla y mantener el comportamiento original del endpoint `GET /admin/customers`, añadiendo soporte de búsqueda por `phone` y (si quieres) incluyendo `phone` dentro del propio `q`.

***

## Objetivo

- Extender el endpoint `GET /admin/customers` de Medusa v1.20.11 para:
    - Aceptar un nuevo query param `phone` para filtrar por campo `customer.phone`.
    - (Opcional) Incluir `phone` en la búsqueda del parámetro `q` junto a `email`, `first_name`, `last_name`.
- Mantener paginación (`limit`, `offset`) y resto de filtros existentes.

***

## Requisitos y contexto

- Proyecto Medusa v1.20.11 (Admin API).
- Node.js / TypeScript.
- Base de datos con TypeORM.
- Entidad `Customer` con columna `phone` (string / nullable).
- Se usará la inyección de dependencias vía `req.scope` y el `manager` (EntityManager) de TypeORM.

***

## Estrategia de extensión

1. **Sobrescribir el handler del endpoint** `GET /admin/customers` usando un archivo de ruta custom en `src/api/admin/customers/route.ts` (o el path equivalente según tu estructura).
2. **Reutilizar** `CustomerRepository` y el `EntityManager` de Medusa.
3. Construir dinámicamente un objeto `where` que:
    - Aplique filtros de texto con `ILike` (búsquedas parciales).
    - Combine condiciones con `$or` para `q` (email, first_name, last_name, y opcionalmente phone).
    - Añada un filtro adicional por `phone` cuando se pase explícitamente `?phone=`.

***

## Especificación del handler (alto nivel)

- Método: `GET`
- Path: `/admin/customers`
- Query params esperados:
    - `limit?: number` (default: 50)
    - `offset?: number` (default: 0)
    - `q?: string` (búsqueda por email, first_name, last_name, y opcionalmente phone)
    - `phone?: string` (búsqueda específica por phone, exacta o parcial)
    - Otros filtros existentes deben seguir respetándose si el proyecto los usa (pueden añadirse al `where`).
- Respuesta:
    - `customers: Customer[]`
    - `count: number`
    - `offset: number`
    - `limit: number`

***

## Implementación sugerida (TypeScript)

Archivo: `src/api/admin/customers/route.ts`
(La ruta exacta puede variar; la clave es que este archivo registre un handler para `GET /admin/customers` en el router de admin.)

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/medusa"
import { CustomerRepository } from "@medusajs/medusa/dist/repositories/customer"
import { EntityManager, ILike } from "typeorm"

type ListCustomersQuery = {
  limit?: number
  offset?: number
  q?: string
  phone?: string
  // Aquí podrías añadir otros filtros ya soportados por Medusa
  // e.g. email?: string; created_at?: { gt?: string; lt?: string }
}

// Handler principal del endpoint
export default async (req: MedusaRequest, res: MedusaResponse) => {
  const manager: EntityManager = req.scope.resolve("manager")
  const customerRepo: CustomerRepository =
    manager.getCustomRepository(CustomerRepository)

  const {
    limit = 50,
    offset = 0,
    q,
    phone,
  } = (req.query || {}) as ListCustomersQuery

  // Construcción dinámica del where
  const where: any = {}

  // --- Búsqueda por q: email / first_name / last_name (+ opcional phone) ---
  if (q && q.length > 0) {
    const qLike = ILike(`%${q}%`)

    // Si NO quieres que phone esté en q -> no añadas phone aquí
    const orConditions: any[] = [
      { email: qLike },
      { first_name: qLike },
      { last_name: qLike },
    ]

    // Si quieres incluir phone en la búsqueda de q, descomenta:
    // orConditions.push({ phone: qLike })

    // Formato OR para TypeORM >=0.3.x (si usas 0.2.x, podrías usar otro patrón)
    ;(where as any).$or = orConditions
  }

  // --- Filtro explícito por phone (prioridad sobre q si se quiere) ---
  if (phone && phone.length > 0) {
    const phoneLike = ILike(`%${phone}%`)

    // Dos aproximaciones:
    // 1) phone adicional: combina lo anterior con un AND global:
    //    where.phone = phoneLike
    // 2) phone preferente: si quieres que phone “manden” sobre q,
    //    podrías ignorar el $or anterior o ajustarlo.
    where.phone = phoneLike
  }

  // Nota: aquí podrías añadir otros filtros, p.ej:
  // if (email) where.email = email;
  // if (created_at?.gt) where.created_at = MoreThan(created_at.gt);

  const [customers, count] = await customerRepo.findAndCount({
    where,
    take: Number(limit),
    skip: Number(offset),
    order: { created_at: "DESC" },
  })

  res.status(200).json({
    customers,
    count,
    offset: Number(offset),
    limit: Number(limit),
  })
}
```


***

## Variantes de comportamiento de `phone`

### 1. Phone solo como filtro explícito

- `q` sigue como está (email, first_name, last_name).
- `phone` solo se usa cuando se pasa `?phone=...`.

En el handler anterior, para este comportamiento:

- Deja el array `orConditions` sin `phone`.
- Mantén `where.phone = phoneLike`.

Ejemplos:

- `GET /admin/customers?q=juan` → busca por email, first_name, last_name que contengan “juan”.
- `GET /admin/customers?phone=+34123` → busca clientes cuyo phone contenga “+34123”.
- `GET /admin/customers?q=juan&phone=+34123` → aplica OR entre email/first_name/last_name para q y AND con phone (según cómo definas `where`).


### 2. Phone incluido dentro de q

- `q` busca en: email, first_name, last_name, phone.
- `phone` opcionalmente puede seguir existiendo como filtro explícito (más preciso).

Para esto:

```ts
if (q && q.length > 0) {
  const qLike = ILike(`%${q}%`)

  const orConditions: any[] = [
    { email: qLike },
    { first_name: qLike },
    { last_name: qLike },
    { phone: qLike }, // incluir phone aquí
  ]

  ;(where as any).$or = orConditions
}
```


***

## Consideraciones para un agent LLM

Cuando un agent LLM tenga que aplicar esta modificación, debería:

1. Detectar si ya existe un handler custom en `src/api/admin/customers`:
    - Si NO existe, crear `route.ts` con el handler completo.
    - Si SÍ existe, localizar el handler de `GET /admin/customers` e inyectar/ajustar:
        - La definición de `ListCustomersQuery` para añadir `phone`.
        - La construcción del `where` para incluir `phone` (explícito y/o dentro de `q`).
2. Mantener intactos:
    - Tipos ya existentes.
    - Filtros preexistentes (por ejemplo, `email`, `groups`, `metadata`, etc.).
    - Paginar con `take` y `skip` usando `limit` y `offset`.
3. Usar búsquedas parciales (`ILike`) por defecto para `phone` salvo que se requiera exact match.
    - Si se pide exact match: `where.phone = phone` (sin `ILike`).

***

## Ejemplo de especificación de tarea para el agent

> Modifica el endpoint `GET /admin/customers` en Medusa v1.20.11 para:
> - Añadir un query param opcional `phone` (string).
> - Cuando `phone` esté presente, filtrar `Customer.phone` usando `ILIKE '%phone%'`.
> - Mantener el comportamiento actual de `q`, pero incluir `phone` en la búsqueda de `q` además de `email`, `first_name`, `last_name`.
> - Conservar `limit`, `offset`, `order` y cualquier otro filtro existente sobre `Customer`.
> - No romper tipos ni rutas existentes; sólo extender el handler actual aprovechando `CustomerRepository` y `EntityManager`.

Si quieres, en el siguiente mensaje puedo generarte una versión concreta adaptada a tu código actual (por ejemplo, pegando tu `route.ts` o el handler original de `customers_getcustomers`).

