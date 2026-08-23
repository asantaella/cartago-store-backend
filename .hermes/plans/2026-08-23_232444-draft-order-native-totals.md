# Draft Order Native Totals Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Maximizar el uso del flujo nativo de MedusaJS v1 para calcular los totales de draft orders, manteniendo únicamente la lógica propia necesaria para el surcharge de shipping y la restauración de métodos de envío tras mutaciones de line items.

**Architecture:** Mantener `CartService` y `TotalsService` nativos como autoridad para subtotal, shipping total, impuestos, descuentos, gift cards, total y cantidades de payment sessions. Extraer la responsabilidad propia a un `ShippingSurchargeService` pequeño, mientras que un endpoint/orquestador transaccional conserva y restaura los shipping methods que Medusa v1 elimina al modificar line items. No se utilizará un middleware de respuesta para persistencia financiera ni se duplicará la fórmula de totales.

**Tech Stack:** MedusaJS v1.20.10, TypeScript, TypeORM, Express middleware, Jest, Yarn.

---

## 1. Contexto verificado

El proyecto está fijado a `@medusajs/medusa@^1.20.10` en `package.json`.

Actualmente existen estas extensiones relacionadas:

- `src/services/draft-order-pricing.ts`
  - calcula el surcharge por variante;
  - aplica transformaciones fiscales específicas;
  - implementa `calculateTotals()` y `applyTotals()`.
- `src/services/totals.ts`
  - reemplaza globalmente el `TotalsService` de Medusa;
  - afecta potencialmente carts normales, draft orders, órdenes, swaps y claims.
- `src/api/middlewares/draft-order-line-item-pricing.ts`
  - guarda snapshots de shipping methods;
  - permite que la mutación nativa se ejecute;
  - restaura shipping methods si Medusa los elimina;
  - aplica el surcharge y los totales posteriores.
- `src/api/admin/cartago/draft-orders/[id]/line-items/[line_id]/route.ts`
  - expone mutaciones custom de line items.
- `src/api/middlewares.ts`
  - registra middlewares para GET/POST de draft orders y mutaciones de line items.

La implementación nativa de Medusa v1 calcula los totales mediante `CartService.retrieveWithTotals()` y `CartService.decorateTotals()`. El pipeline nativo calcula line item totals, shipping method totals, impuestos, descuentos, gift cards y el agregado final del cart.[1][2]

Medusa v1 también elimina los shipping methods existentes durante algunas mutaciones de line items. Por tanto, la restauración debe ocurrir alrededor de la llamada nativa y antes del cálculo final de totales.[2]

## 2. Decisión arquitectónica

La solución será una composición de tres responsabilidades:

```text
Orquestador transaccional de draft order
  - snapshot del shipping
  - llamada al servicio nativo
  - restauración del shipping
  - coordinación del recálculo

ShippingSurchargeService
  - calcular extra por variante y cantidad
  - aplicarlo de forma idempotente al ShippingMethod

Medusa CartService/TotalsService
  - subtotal
  - shipping_total
  - shipping_tax_total
  - item_tax_total
  - tax_total
  - discount_total
  - gift_card_total
  - total
  - payment/session amounts según el flujo nativo
```

El servicio propio no debe asignar manualmente `cart.subtotal`, `cart.shipping_total`, `cart.tax_total`, `cart.discount_total` ni `cart.total`.

## 3. Alcance y no alcance

### Incluido

- Mutación de line items de draft orders.
- Preservación de shipping methods eliminados por Medusa.
- Aplicación del `shipping_option_price_extra`.
- Uso del cálculo nativo de Medusa después de aplicar el precio efectivo de shipping.
- Compatibilidad con descuentos, free shipping, impuestos y gift cards nativos.
- Persistencia coherente dentro de una única transacción.
- GET/POST de draft orders sin fórmulas de totales duplicadas.
- Actualización o eliminación del override global de `TotalsService`.

### No incluido

- Cambios en el modelo de Medusa.
- Cambios en el comportamiento de carts normales salvo eliminar el override global que los afecta indirectamente.
- Rediseño de la política fiscal española.
- Creación de una nueva entidad para cargos de shipping.
- Cambios en proveedores de pago salvo los necesarios para respetar el flujo nativo.
- Migración a Medusa v2.

## 4. Flujo objetivo para mutar un line item

El flujo final debe ser:

```text
HTTP request
  -> autenticación/validación nativa
  -> transacción del endpoint custom
      -> recuperar draft order + cart + shipping methods
      -> tomar snapshot completo del shipping
      -> ejecutar CartService.updateLineItem/removeLineItem con transaction manager
      -> recuperar el cart actualizado dentro de la misma transacción
      -> restaurar shipping methods si la mutación los eliminó
      -> ShippingSurchargeService.apply(cart)
      -> aplicar la política fiscal propia si procede
      -> CartService.decorateTotals(cart)
      -> persistir entidades requeridas
      -> retrieveWithTotals() para formar la respuesta
  -> devolver `{ draft_order }`
```

La llamada a `decorateTotals()` debe recibir el mismo `EntityManager` transaccional mediante `withTransaction(transactionManager)`.

No debe utilizarse:

```ts
setImmediate(async () => { ... })
```

para persistir precios o totales después de devolver la respuesta.

## 5. Plan de implementación paso a paso

### Task 1: Caracterizar el comportamiento actual

**Objetivo:** Capturar los casos que no pueden romperse durante el cambio.

**Archivos:**

- Test: `src/services/__tests__/draft-order-pricing.spec.ts`
- Test: `src/api/admin/cartago/draft-orders/[id]/line-items/[line_id]/route.spec.ts`
- Test: `src/api/middlewares/cart-pricing-on-get.spec.ts`
- Referencia: `src/api/middlewares/draft-order-line-item-pricing.ts`

**Casos mínimos:**

- surcharge por cantidad;
- aplicación repetida sin acumular el extra;
- actualización de cantidad;
- eliminación del último line item;
- shipping method eliminado por `CartService.updateLineItem()`;
- shipping method restaurado con `shipping_option_id`, `price`, `data` e `includes_tax`;
- free shipping con precio cero;
- descuento parcial de shipping;
- gift card;
- shipping con `includes_tax = true`;
- dirección tax-exempt y dirección estándar;
- error de mutación con rollback;
- coherencia entre respuesta y valores persistidos.

**Verificación:**

```bash
yarn jest src/services/__tests__/draft-order-pricing.spec.ts src/api/admin/cartago/draft-orders/[id]/line-items/[line_id]/route.spec.ts --runInBand
```

Esperado: los tests actuales pasan antes de modificar la implementación nueva. Los tests nuevos deben fallar si el flujo nativo no se invoca con el transaction manager.

### Task 2: Crear `ShippingSurchargeService`

**Objetivo:** Separar la única regla monetaria propia del cálculo agregado.

**Archivos:**

- Create: `src/services/shipping-surcharge.ts`
- Test: `src/services/__tests__/shipping-surcharge.spec.ts`
- Modify: registro de servicios si el contenedor requiere una entrada explícita.

**Responsabilidades:**

- `calculate(cart): number` suma `shipping_option_price_extra * quantity`.
- `apply(cart): number` modifica exclusivamente `shipping_methods[].price` y `data`.
- El cálculo debe ser idempotente.
- Debe conservar un precio base suficiente para no acumular el surcharge en llamadas repetidas.
- Debe distinguir un shipping gratuito ya aplicado de un shipping cuyo precio inicial es cero.
- No debe escribir ningún total agregado del cart.

**Contrato sugerido:**

```ts
export default class ShippingSurchargeService {
  calculate(cart: CartEntity): number
  apply(cart: CartEntity): number
}
```

**Verificación:**

```bash
yarn jest src/services/__tests__/shipping-surcharge.spec.ts --runInBand
```

### Task 3: Migrar la restauración de shipping a un orquestador transaccional

**Objetivo:** Mantener la restauración sin mezclarla con el cálculo de totales.

**Archivos:**

- Modify: `src/api/admin/cartago/draft-orders/[id]/line-items/[line_id]/route.ts`
- Modify: `src/api/middlewares/draft-order-line-item-pricing.ts`
- Test: `src/api/admin/cartago/draft-orders/[id]/line-items/[line_id]/route.spec.ts`

**Implementación:**

1. Resolver `manager`, `draftOrderService`, `cartService` y `shippingSurchargeService` desde el request scope.
2. Abrir una única transacción con `manager.transaction()`.
3. Recuperar el draft order usando `draftOrderService.withTransaction(tm)`.
4. Tomar un snapshot completo de los shipping methods antes de llamar al servicio nativo.
5. Ejecutar `cartService.withTransaction(tm).updateLineItem()` o `removeLineItem()`.
6. Recargar el cart con todas las relaciones necesarias.
7. Restaurar los shipping methods solamente cuando Medusa los haya eliminado y el cart todavía tenga line items.
8. Aplicar `shippingSurchargeService.apply(cart)`.
9. Ejecutar el flujo fiscal específico antes del cálculo nativo, si dicho flujo modifica precios base.
10. Ejecutar `await cartService.withTransaction(tm).decorateTotals(cart)`.
11. Guardar las entidades modificadas dentro de `tm`.
12. Recargar la respuesta con `retrieveWithTotals()` o utilizar el cart decorado si conserva exactamente el contrato esperado.

**Restricción:** La restauración no debe ejecutar una segunda transacción independiente ni ocurrir después de enviar la respuesta.

**Verificación:**

- comprobar que el mock de `CartService` recibe el transaction manager;
- comprobar que `decorateTotals()` se llama después de aplicar el surcharge;
- comprobar rollback si falla la restauración o el cálculo;
- comprobar que el segundo update no duplica el surcharge.

### Task 4: Sustituir `calculateTotals()` y `applyTotals()` por el cálculo nativo

**Objetivo:** Eliminar la duplicación de la fórmula de Medusa.

**Archivos:**

- Modify: `src/services/draft-order-pricing.ts`
- Modify: `src/api/admin/cartago/draft-orders/[id]/line-items/[line_id]/route.ts`
- Modify: `src/api/middlewares/draft-order-line-item-pricing.ts`
- Modify: `src/api/middlewares/cart-pricing-on-get.ts`
- Test: tests de servicios y endpoints de draft order.

**Cambios:**

- Eliminar `DraftOrderTotals` si deja de ser utilizado.
- Eliminar `calculateTotals()`.
- Eliminar `applyTotals()`.
- Mantener en el servicio propio solamente surcharge y reglas fiscales específicas.
- Sustituir cada llamada a `applyTotals()` por `cartService.decorateTotals()` en una ruta transaccional.
- En GET, no modificar únicamente `res.json` para simular un total persistido.
- Si un GET necesita recalcular un cart existente, resolver `cartService`, aplicar el surcharge sobre una copia/entidad adecuada y ejecutar el método nativo antes de serializar.
- No asignar manualmente `payment_sessions[].amount` desde el servicio de surcharge.

**Verificación:**

```bash
rg "calculateTotals|applyTotals|DraftOrderTotals" src
```

Esperado: no quedan referencias de producción a esos métodos.

### Task 5: Eliminar el override global de `TotalsService`

**Objetivo:** Restaurar el comportamiento nativo de Medusa para todas las entidades que resuelven `totalsService`.

**Archivos:**

- Delete: `src/services/totals.ts`
- Modify: cualquier registro o import que dependa de ese override.
- Test: regresiones de carts, órdenes, swaps, claims y draft orders.

**Comprobaciones:**

- No existe otro servicio con el mismo nombre que sustituya globalmente a Medusa.
- El comportamiento tax-exempt se aplica antes del cálculo nativo mediante el flujo propio de Cartago.
- El cálculo de gift cards utiliza también el tratamiento nativo de `gift_card_tax_total`.
- Los carts normales no requieren metadata especial para que `TotalsService` funcione.

**Verificación:**

```bash
rg "class TotalsService|TotalsService as|services/totals" src
```

Esperado: no queda override global ni import muerto.

### Task 6: Revisar los middlewares HTTP

**Objetivo:** Limitar los middlewares a adaptación de transporte y orquestación puntual.

**Archivos:**

- Modify: `src/api/middlewares.ts`
- Modify: `src/api/middlewares/draft-order-pricing.ts`
- Modify: `src/api/middlewares/cart-pricing-on-get.ts`
- Modify: `src/api/middlewares/draft-order-line-item-pricing.ts`

**Reglas:**

- No persistir importes mediante `setImmediate`.
- No devolver una respuesta correcta si la persistencia necesaria falló.
- No usar middleware global para modificar el agregado de carts normales por una necesidad exclusiva de draft orders.
- Si el middleware de respuesta se conserva para compatibilidad, debe limitarse a una proyección no persistente y no presentar valores contradictorios con el cart nativo.
- Preferir matcher específico para `/admin/draft-orders/:id/line-items/*`.
- No interceptar rutas de carts normales para aplicar lógica de draft orders.

### Task 7: Validar pago y coherencia de importes

**Objetivo:** Garantizar que el importe usado por pago coincide con el total nativo final.

**Archivos:**

- Inspect/modify: `src/api/middlewares/draft-order-pricing.ts`
- Inspect/modify: middleware de pago de draft orders.
- Test: tests de pago de draft order si existen; crear uno si falta.

**Casos:**

- pagar después de cambiar cantidad;
- pagar después de eliminar/agregar line items;
- shipping extra aplicado una sola vez;
- free shipping;
- gift card parcial y total;
- dirección tax-exempt;
- fallo antes de registrar el pago;
- payment session amount igual al total final que consume Medusa.

**Restricción:** No asignar directamente `payment_sessions.amount` como sustituto del flujo nativo sin verificar el contrato del servicio de pagos.

### Task 8: Ejecutar regresión completa y revisar el diff

**Objetivo:** Verificar la implementación completa y separar fallos preexistentes.

**Comandos:**

```bash
yarn tsc -p tsconfig.json --noEmit
yarn test --runInBand
yarn build:server
git diff --check
git status --short
git diff --stat
```

**Criterios de aceptación:**

- TypeScript compila sin errores.
- Los tests específicos de draft orders pasan.
- El endpoint de update/delete mantiene el envelope `{ draft_order }`.
- Los totales de respuesta y persistencia son iguales después de la mutación.
- El surcharge no se duplica en ejecuciones repetidas.
- Free shipping permanece gratuito cuando el descuento nativo lo deja en cero.
- Los descuentos, impuestos y gift cards son calculados por Medusa, no por una fórmula duplicada.
- Carts normales, órdenes, swaps y claims no reciben el comportamiento de draft order.
- El build de servidor finaliza correctamente.
- Cualquier fallo no relacionado queda documentado con su suite y error exacto.

## 6. Riesgos y mitigaciones

### Medusa elimina shipping methods durante la mutación

**Riesgo:** El surcharge no puede aplicarse si no existe ningún shipping method.

**Mitigación:** Snapshot y restauración antes de invocar el cálculo nativo.

### El shipping extra se acumula

**Riesgo:** Aplicar varias veces el surcharge sobre `method.price` produce un importe incorrecto.

**Mitigación:** Guardar el extra aplicado en `method.data` y reconstruir siempre desde el precio base.

### Free shipping se convierte en shipping de pago

**Riesgo:** Restaurar el precio base después de un descuento total elimina el efecto de free shipping.

**Mitigación:** Tratar explícitamente el precio cero derivado de un descuento y cubrirlo con una prueba de regresión.

### Totales de respuesta y base de datos divergen

**Riesgo:** El middleware modifica `res.json` pero la persistencia falla o termina después.

**Mitigación:** Ejecutar la operación completa dentro de una transacción y recargar el resultado final antes de serializarlo.

### El override global produce regresiones

**Riesgo:** `src/services/totals.ts` afecta a recursos que no son draft orders.

**Mitigación:** Eliminar el override y aplicar la lógica específica solamente en el flujo de draft order.

### El servicio fiscal modifica precios después del cálculo nativo

**Riesgo:** `decorateTotals()` calcula a partir de precios que ya no representan la política fiscal deseada.

**Mitigación:** Definir claramente el orden: normalizar precio fiscal -> aplicar surcharge -> decorar totales nativos.

## 7. Decisiones abiertas antes de implementar

1. Confirmar si el surcharge debe participar en descuentos de shipping o ser inmune a ellos.
2. Confirmar si el surcharge está sujeto al impuesto del shipping method.
3. Confirmar si un shipping method con descuento del 100% debe mantener el surcharge en cero o cobrar únicamente el surcharge.
4. Confirmar qué rutas de creación/actualización de draft order deben persistir la transformación fiscal.
5. Confirmar si `CartService.decorateTotals()` en la versión instalada es público y puede utilizarse con `withTransaction(tm)` en todos los puntos previstos.
6. Confirmar el flujo exacto de actualización de payment sessions antes de retirar la asignación manual.

## 8. Resultado esperado

La implementación final debe reducir la lógica custom a:

```text
shipping surcharge + restauración transaccional del shipping
```

El cálculo monetario restante debe ejecutarse mediante los servicios nativos de Medusa v1. La existencia de un servicio propio será una decisión de organización y testabilidad, no una sustitución del pipeline de totales de Medusa.

## Sources

[1] https://raw.githubusercontent.com/medusajs/medusa/v1.20.10/packages/medusa/src/services/totals.ts

[2] https://raw.githubusercontent.com/medusajs/medusa/v1.20.10/packages/medusa/src/services/cart.ts

[3] https://raw.githubusercontent.com/medusajs/medusa/v1.20.10/packages/medusa/src/services/draft-order.ts

[4] https://github.com/medusajs/medusa/discussions/4108
