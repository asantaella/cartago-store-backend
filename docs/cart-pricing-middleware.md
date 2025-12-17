# Implementación de Ajuste de Precios mediante Middlewares

## Descripción

Esta implementación reemplaza el servicio personalizado `CartService` por middlewares que interceptan las peticiones HTTP al carrito para ajustar precios según el código postal de envío para zonas con exención de IVA (Canarias, Ceuta y Melilla).

## Ventajas sobre el enfoque anterior

1. **No sobrescribe servicios core**: Evita problemas de compatibilidad y transaccionalidad al no modificar `CartService`
2. **Mejor performance**: Solo recalcula cuando es necesario (en las respuestas HTTP)
3. **Transaccionalidad garantizada**: Las actualizaciones de precios en POST/PATCH se hacen dentro de transacciones atómicas
4. **Menor complejidad**: La lógica está centralizada en middlewares específicos
5. **Sin dependencias circulares**: No hay conflictos con el DI container de Medusa

## Arquitectura

### Middlewares creados

#### `adjustCartPricingOnGet`

- **Ruta**: `GET /store/carts/*`
- **Función**: Recalcula precios en la respuesta sin persistir cambios
- **Uso**: Para mostrar precios ajustados al cliente según su código postal

#### `adjustCartPricingOnPost`

- **Ruta**: `POST/PATCH /store/carts/*`
- **Función**: Recalcula y persiste precios en la base de datos
- **Uso**: Para actualizar precios cuando se añaden items, se cambia dirección, etc.

## Lógica de cálculo

### Zonas de exención de IVA

- **Canarias**: Códigos postales 35xxx y 38xxx
- **Ceuta**: Códigos postales 51xxx
- **Melilla**: Códigos postales 52xxx

### Cálculo de precios

- **Zona estándar**: Precio original (incluye IVA 21%)
- **Zona exenta**: `Precio sin IVA = Precio con IVA / 1.21` (redondeado)

## Comportamiento especial

### Cambio de zona fiscal

Cuando el usuario cambia de una zona a otra (ej: de Madrid a Canarias):

1. Se detecta el cambio comparando `metadata.previous_tax_zone`
2. Se eliminan automáticamente los métodos de envío previos
3. Se recalculan los precios de los items
4. El usuario debe seleccionar nuevamente el método de envío

### Draft Orders

Los draft orders (`cart.type === "draft_order"`) se excluyen del ajuste automático de precios para permitir edición manual por admin.

## Campos de metadata añadidos

En el objeto `cart.metadata` se añaden:

- `territory_type`: Tipo de territorio (standard, canarias, ceuta, melilla)
- `prices_adjusted`: Boolean indicando si se ajustaron precios
- `previous_tax_zone`: Zona fiscal anterior para detectar cambios

## Archivos involucrados

```
src/
├── api/
│   ├── middlewares.ts                 # Registro de middlewares
│   └── middlewares/
│       └── cart-pricing.ts            # Lógica de ajuste de precios
└── services/
    └── spanish-tax.ts                 # Servicio de utilidades para taxes
```

## Archivos eliminados

- `src/services/cart.ts` - Servicio personalizado removido
- `src/loaders/cart-service.ts` - Loader del servicio removido

## Testing

Para probar la implementación:

1. **Crear un carrito con dirección en zona estándar**:

   ```bash
   POST /store/carts
   POST /store/carts/{id}/shipping-address
   # body: { postal_code: "28001" } // Madrid
   ```

2. **Verificar precios originales**:

   ```bash
   GET /store/carts/{id}
   # Los precios deben incluir IVA
   ```

3. **Cambiar a zona exenta**:

   ```bash
   POST /store/carts/{id}/shipping-address
   # body: { postal_code: "35001" } // Las Palmas
   ```

4. **Verificar precios ajustados**:
   ```bash
   GET /store/carts/{id}
   # Los precios deben estar sin IVA (reducidos ~17%)
   # Los shipping_methods deben estar vacíos (por cambio de zona)
   ```

## Consideraciones

- Los middlewares se ejecutan después de que Medusa procese la petición
- El ajuste de precios es transparente para el frontend
- Los totales se recalculan automáticamente incluyendo subtotal, shipping y total
- La lógica funciona con el `SpanishTaxService` existente sin modificaciones

## Monitoring

Los middlewares generan logs con el prefijo `[cart-pricing-middleware]` para facilitar debugging:

- Detección de zona fiscal
- Actualizaciones de precios
- Cambios de zona
- Errores en el procesamiento
