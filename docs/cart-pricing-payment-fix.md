# Fix: Payment Session Amount en Tax Exempt Regions

## 🐛 Problema

Al completar un carrito en una región exenta de impuestos (Canarias, Ceuta, Melilla), el Order se creaba correctamente con los totales ajustados (sin IVA), pero el pago en Stripe se procesaba con el importe incorrecto (con IVA incluido).

### Ejemplo del Error

**Escenario:**

- Item: 8,26€ (con IVA) → 6,83€ (sin IVA)
- Shipping: 29,99€ (con IVA) → 24,79€ (sin IVA)
- Descuento: 3%
- **Total Order esperado:** 38,00€ aprox (sin IVA, con descuento)
- **Total Stripe cobrado:** 45,99€ (con IVA, sin descuento) ❌

**Diferencia:** 7,99€ de más cobrados al cliente

## 🔍 Causa Raíz

El middleware `persistCartPricingOnComplete` actualizaba correctamente:

1. ✅ Los precios de `line_items.unit_price` (sin IVA)
2. ✅ Los precios de `shipping_methods.price` (sin IVA)
3. ✅ Los descuentos ajustados en `line_items.discount_total`
4. ❌ Las `payment_sessions.amount` (intentaba actualizar manualmente)

El problema era que:

- El middleware actualizaba las payment sessions **en la base de datos**
- Pero cuando Medusa ejecutaba el `cart.complete()`, **recargaba el cart desde otra fuente** (cache o nueva query)
- Las payment sessions **NO reflejaban** los cambios recientes
- Stripe recibía el amount original (con IVA)

## ✅ Solución

Cambiar la estrategia de actualización de payment sessions:

### Antes (Incorrecto)

```typescript
// Actualizar payment sessions manualmente en la BD
for (const session of cart.payment_sessions) {
  session.amount = newTotal;
  await paymentSessionRepo.save(session);
}
```

### Después (Correcto)

```typescript
// Usar CartService.setPaymentSessions() para recalcular
await cartService.setPaymentSessions(cartId);
```

## 🔧 Cambios Implementados

### Archivo: `src/api/middlewares/cart-pricing-on-complete.ts`

1. **Nueva función `refreshPaymentSessions`:**

   ```typescript
   async function refreshPaymentSessions(
     cartService: any,
     cartId: string
   ): Promise<void> {
     await cartService.setPaymentSessions(cartId);
     log(`Payment sessions refreshed for cart ${cartId}`);
   }
   ```

2. **Eliminada función anterior:** `updatePaymentSessions` (que actualizaba manualmente)

3. **Middleware actualizado:**
   - Resuelve `cartService` desde el scope de la request
   - Ejecuta la transacción para actualizar precios (igual que antes)
   - **DESPUÉS** de la transacción, llama a `refreshPaymentSessions`
   - Esto fuerza a CartService a recalcular las payment sessions con los nuevos precios

## 🎯 Beneficios

1. **Correcta sincronización:** CartService recalcula usando los precios actualizados
2. **Usa el flujo nativo de Medusa:** No hackeamos la actualización manual
3. **Cache invalidado:** CartService maneja su propia cache correctamente
4. **Totales consistentes:** El amount del payment session coincide con el Order total

## 📊 Flujo Actualizado

```
┌─────────────────────────────────────────────┐
│ POST /store/carts/:id/complete              │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│ persistCartPricingOnComplete Middleware     │
├─────────────────────────────────────────────┤
│ 1. Detectar tax exempt region               │
│ 2. Transaction:                             │
│    ├─ Ajustar line_items.unit_price         │
│    ├─ Ajustar shipping_methods.price        │
│    ├─ Ajustar line_items.discount_total     │
│    └─ Actualizar cart.metadata              │
│ 3. COMMIT transaction                       │
│ 4. cartService.setPaymentSessions(cartId)   │ ← NUEVO
│    └─ Recalcula payment_sessions.amount     │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│ Medusa CartService.complete()               │
├─────────────────────────────────────────────┤
│ • Carga cart con precios actualizados       │
│ • Payment sessions tienen amount correcto   │
│ • Autoriza pago en Stripe con total exacto  │
│ • Crea Order con totales consistentes       │
└─────────────────────────────────────────────┘
```

## ✅ Validación

Para validar que el fix funciona:

1. **Crear un cart con postal code de Canarias** (35xxx o 38xxx)
2. **Añadir productos y shipping**
3. **Aplicar un descuento** (ej: CARTAGO3 = 3%)
4. **Crear payment session**
5. **Completar el cart**

Verificar que:

- ✅ Order.total = precio sin IVA - descuento
- ✅ Payment.amount = Order.total (coinciden exactamente)
- ✅ Stripe charge = Order.total

## 🔗 Referencias

- Archivo modificado: [src/api/middlewares/cart-pricing-on-complete.ts](../src/api/middlewares/cart-pricing-on-complete.ts)
- Documentación: [cart-pricing-architecture.md](./cart-pricing-architecture.md)
- Medusa CartService: `node_modules/@medusajs/medusa/dist/services/cart.js`
