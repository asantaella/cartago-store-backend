# Fix: Payment Session Amount en Tax Exempt Regions - Solución Final

## 📋 Resumen

Se ha corregido el problema donde los pagos en Stripe se procesaban con el importe incorrecto para regiones exentas de impuestos (Canarias, Ceuta, Melilla).

### 🐛 Problema Original

Al completar un carrito en una región tax exempt:

- **Order creada correctamente:** Total de 38,00€ (sin IVA, con descuento)
- **Pago en Stripe:** Importe de 45,99€ (con IVA, sin descuento)
- **Diferencia:** 7,99€ cobrados de más al cliente

### ✅ Solución: Dos Componentes

La solución se divide en dos partes complementarias:

#### 1️⃣ **Middleware de Persistencia**

[src/api/middlewares/cart-pricing-on-complete.ts](src/api/middlewares/cart-pricing-on-complete.ts)

**Responsabilidad:** Ajustar los precios en la base de datos ANTES de que Medusa complete la orden.

**Acciones:**

- Detecta si el cart está en una región tax exempt
- Ajusta `line_items.unit_price` (con IVA → sin IVA)
- Ajusta `shipping_methods.price` (con IVA → sin IVA)
- Ajusta `line_items.discount_total` proporcionalmente
- Actualiza `payment_sessions.amount` con el total correcto
- Marca `cart.metadata.prices_adjusted = true` como indicador

#### 2️⃣ **TotalsService Personalizado**

[src/services/totals.ts](src/services/totals.ts) ← **CLAVE**

**Responsabilidad:** Evitar que Medusa recalcule y sobrescriba los totales.

**Lógica:**

```typescript
if (cart.metadata.prices_adjusted === true) {
  // NO recalcular, usar los precios ya persistidos
  return subtotal + shipping - discount - giftCard;
} else {
  // Comportamiento normal de Medusa
  return super.getTotal(cart, options);
}
```

Este servicio es crucial porque:

- ✅ Evita el recálculo que sobrescribía los payment_sessions.amount
- ✅ Respeta los precios ya ajustados en la base de datos
- ✅ El total sigue siendo consistente durante toda la cadena de complete

## 📊 Flujo de Ejecución

```
POST /store/carts/:id/complete
        ↓
persistCartPricingOnComplete Middleware
├─ Detecta postal 38100 (Canarias)
├─ Transaction:
│  ├─ line_items.unit_price: 1000 → 826 cents
│  ├─ shipping_methods.price: 3629 → 2999 cents
│  ├─ line_items.discount_total: 30 → 25 cents (proporcional)
│  ├─ line_item.adjustments: actualizar amounts
│  └─ cart.metadata.prices_adjusted: true
├─ Commit transaction
└─ Actualizar payment_sessions.amount: 4599 → 3800 cents
        ↓
Medusa CartService.complete()
├─ Cargar cart desde BD
├─ TotalsService.getTotal() [CUSTOM]
│  └─ Detecta cart.metadata.prices_adjusted = true
│     └─ USA precios persistidos (sin recalcular)
│        └─ Return 3800 cents
├─ Autorizar payment en Stripe: amount = 3800 cents ✅
└─ Crear Order: total = 3800 cents (38,00€) ✅
```

## 🎯 Comportamiento Resultante

| Concepto           | Antes ❌        | Después ✅    |
| ------------------ | --------------- | ------------- |
| Order.total        | 38,00€          | 38,00€        |
| Payment.amount     | 45,99€          | 38,00€        |
| Stripe charge      | 45,99€          | 38,00€        |
| Descuento aplicado | No              | Sí            |
| IVA cobrado        | Sí (incorrecto) | No (correcto) |

## 📁 Archivos Modificados

### 1. Middleware de Persistencia

- **Archivo:** `src/api/middlewares/cart-pricing-on-complete.ts`
- **Cambios:** Simplificado y depurado
- **Líneas:** ~369
- **Lógica:** Actualiza precios y payment sessions, marca cart como adjusted

### 2. TotalsService Custom

- **Archivo:** `src/services/totals.ts` (NUEVO)
- **Cambios:** Extiende TotalsService de Medusa
- **Líneas:** ~47
- **Lógica:** Respeta precios ya ajustados, evita recálculos

### 3. Archivos Eliminados

- ❌ `src/services/stripe-payment-processor.ts` (innecesario)
- ❌ Lógica de invalidación de cache (innecesaria)
- ❌ Lógica de recarga de CartService (innecesaria)

## ✨ Ventajas de Esta Solución

1. **Mínima y enfocada:** Solo dos archivos, lógica clara
2. **Usa flujos nativos de Medusa:** No hackea servicios, los extiende
3. **Sin efectos secundarios:** No invalida caches innecesariamente
4. **Mantenible:** Código limpio y bien documentado
5. **Escalable:** Funciona para cualquier región tax exempt

## 🧪 Validación

Para verificar que funciona:

```bash
# 1. Crear cart con postal code de Canarias (38xxx)
# 2. Agregar producto y shipping
# 3. Aplicar descuento (CARTAGO3 = 3%)
# 4. Crear payment session
# 5. Completar cart

# Verificar logs:
[cart-pricing-middleware] COMPLETE cart ... postal=38100 isTaxExempt=true
[cart-pricing-middleware] Updated payment session ...: 4599 → 3800 cents
[TotalsService] Using adjusted prices for cart ... (tax-exempt region)

# Verificar en BD:
# - order.total = 3800 (38,00€)
# - order.items[0].unit_price = 826 (8,26€)
# - order.shipping[0].price = 2999 (29,99€)
```

## 📝 Notas Técnicas

- El metadata `prices_adjusted` sirve como bandera para que TotalsService sepa cuándo NO recalcular
- Las payment sessions se actualizan FUERA de la transacción para garantizar que Medusa las vea
- El cart.updated_at se modifica para invalidar cualquier cache distribuido
- El descuento se recalcula proporcionalmente al cambio de precio (proporción correcta)

## 🔗 Referencias

- Documentación anterior: [docs/cart-pricing-architecture.md](../docs/cart-pricing-architecture.md)
- Medusa TotalsService: `node_modules/@medusajs/medusa/dist/services/totals.js`
- Medusa CartService: `node_modules/@medusajs/medusa/dist/services/cart.js`
