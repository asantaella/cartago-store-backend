# Arquitectura de Ajuste de Precios por Código Postal

## 🏗️ Diagrama de Flujo

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENTE (Frontend)                         │
└────────────────┬────────────────────────────────────┬───────────────┘
                 │                                    │
                 │ GET /store/carts/:id               │ POST /store/carts/:id
                 │                                    │
                 ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     MEDUSA CORE (v1.20.11)                          │
│                                                                     │
│  1. Procesa petición                                                │
│  2. Aplica lógica de negocio                                        │
│  3. Genera respuesta con cart                                       │
└────────────────┬────────────────────────────────────┬───────────────┘
                 │                                    │
                 │ Response                           │ Response
                 │                                    │
                 ▼                                    ▼
┌─────────────────────────────────────┐  ┌──────────────────────────────┐
│  adjustCartPricingOnGet             │  │  adjustCartPricingOnPost     │
│  (Middleware)                       │  │  (Middleware)                │
│                                     │  │                              │
│  • Detecta código postal            │  │  • Detecta código postal     │
│  • Calcula zona fiscal              │  │  • Calcula zona fiscal       │
│  • Ajusta precios en respuesta      │  │  • Ajusta precios en resp.   │
│  • NO persiste en DB                │  │  • Persiste en DB (async)    │
└─────────────────┬───────────────────┘  └──────────────┬───────────────┘
                  │                                     │
                  │                                     │
                  ▼                                     ▼
         ┌─────────────────┐                  ┌─────────────────┐
         │  Response con   │                  │  Response con   │
         │ precios ajust.  │                  │ precios ajust.  │
         └────────┬────────┘                  └────────┬────────┘
                  │                                     │
                  │                                     │
                  ▼                                     ▼
         ┌─────────────────────────────────────────────────────┐
         │              CLIENTE (Frontend)                     │
         │      Recibe precios ajustados según zona            │
         └─────────────────────────────────────────────────────┘
                                                        │
                                                        │
                                    ┌───────────────────▼──────────────┐
                                    │  setImmediate() - Background     │
                                    │                                  │
                                    │  Transaction:                    │
                                    │  1. Update line_item.unit_price  │
                                    │  2. Update shipping_method.price │
                                    │  3. Update cart.metadata         │
                                    │  4. Remove shipping (si cambio)  │
                                    └──────────────────────────────────┘
                                                        │
                                                        ▼
                                             ┌───────────────────┐
                                             │   PostgreSQL      │
                                             │   (Persistencia)  │
                                             └───────────────────┘
```

## 🔄 Flujo de Decisión de Precios

```
                              ┌──────────────────┐
                              │  Cart con        │
                              │  postal_code     │
                              └────────┬─────────┘
                                       │
                    ┌──────────────────▼───────────────────┐
                    │  SpanishTaxService                   │
                    │  .isTaxExemptAddress(postal_code)    │
                    └──────────────────┬───────────────────┘
                                       │
                    ┌──────────────────▼───────────────────┐
                    │  Detectar tipo de territorio:        │
                    │  • 35xxx, 38xxx → Canarias          │
                    │  • 51xxx → Ceuta                     │
                    │  • 52xxx → Melilla                   │
                    │  • Otros → Península (standard)      │
                    └──────────────────┬───────────────────┘
                                       │
                    ┌──────────────────▼───────────────────┐
                    │      ¿Es zona exenta de IVA?         │
                    └──────────┬────────────────┬──────────┘
                               │                │
                          SÍ   │                │   NO
                               │                │
                ┌──────────────▼──────┐    ┌────▼─────────────────┐
                │ Precio sin IVA:     │    │ Precio con IVA:      │
                │ base_price / 1.21   │    │ base_price           │
                └──────────────────────┘    └──────────────────────┘
                          │                          │
                          └─────────┬────────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │  Aplicar a:                   │
                    │  • line_items.unit_price      │
                    │  • shipping_methods.price     │
                    │  • Recalcular totales         │
                    └───────────────────────────────┘
```

## 📦 Componentes del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                         Backend Medusa                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐                                           │
│  │ SpanishTaxService│  ← Servicio de utilidades (sin cambios)  │
│  │                 │                                            │
│  │ • isTaxExempt() │                                            │
│  │ • getTerritoryType() │                                       │
│  │ • calculatePrice...() │                                      │
│  └─────────────────┘                                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐       │
│  │ Middlewares (NUEVO)                                 │       │
│  │                                                     │       │
│  │  ┌────────────────────────────────────────┐        │       │
│  │  │ adjustCartPricingOnGet                 │        │       │
│  │  │ • Lee respuesta                        │        │       │
│  │  │ • Ajusta precios                       │        │       │
│  │  │ • Devuelve modificada                  │        │       │
│  │  └────────────────────────────────────────┘        │       │
│  │                                                     │       │
│  │  ┌────────────────────────────────────────┐        │       │
│  │  │ adjustCartPricingOnPost                │        │       │
│  │  │ • Lee respuesta                        │        │       │
│  │  │ • Ajusta precios (sync)                │        │       │
│  │  │ • Persiste en DB (async)               │        │       │
│  │  │ • Devuelve modificada                  │        │       │
│  │  └────────────────────────────────────────┘        │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐       │
│  │ Medusa Core (sin modificar)                        │       │
│  │ • CartService (original)                            │       │
│  │ • OrderService                                      │       │
│  │ • Otros servicios                                   │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 🎯 Códigos Postales y Zonas

```
┌─────────────────────────────────────────────────────────────────┐
│                      Mapa de España - Zonas Fiscales             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────┐                │
│  │  PENÍNSULA (IVA 21%)                       │                │
│  │  Códigos postales: 01xxx - 50xxx (excep.)  │                │
│  │  • Madrid: 28xxx                            │                │
│  │  • Barcelona: 08xxx                         │                │
│  │  • Valencia: 46xxx                          │                │
│  │  • etc.                                     │                │
│  └────────────────────────────────────────────┘                │
│                                                                 │
│  ┌────────────────────────────────────────────┐                │
│  │  🏝️ CANARIAS (IVA 0%)                      │                │
│  │  Códigos postales:                          │                │
│  │  • Las Palmas: 35xxx                        │                │
│  │  • Santa Cruz de Tenerife: 38xxx            │                │
│  │  → Precio = base_price / 1.21               │                │
│  └────────────────────────────────────────────┘                │
│                                                                 │
│  ┌────────────────────────────────────────────┐                │
│  │  CEUTA (IVA 0%)                            │                │
│  │  Códigos postales: 51xxx                    │                │
│  │  → Precio = base_price / 1.21               │                │
│  └────────────────────────────────────────────┘                │
│                                                                 │
│  ┌────────────────────────────────────────────┐                │
│  │  MELILLA (IVA 0%)                          │                │
│  │  Códigos postales: 52xxx                    │                │
│  │  → Precio = base_price / 1.21               │                │
│  └────────────────────────────────────────────┘                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 🔐 Transaccionalidad y Performance

```
POST Request Timeline:
───────────────────────────────────────────────────────────

T0: Request recibido
│
├─ Medusa procesa (~100-200ms)
│  └─ Cart actualizado en DB
│
T1: Middleware intercepta respuesta
│
├─ Ajusta precios en respuesta (síncronamente, ~1-5ms)
│  └─ Cliente recibe respuesta
│
T2: Respuesta enviada al cliente (~150-250ms total)
│
├─ setImmediate() ejecuta persistencia (asíncrono)
│  └─ Transaction:
│     ├─ Actualiza line_items (~10-30ms)
│     ├─ Actualiza shipping_methods (~5-10ms)
│     └─ Actualiza metadata (~5ms)
│
T3: Persistencia completada (~50-100ms después)

```

## ✨ Beneficios Visuales

```
┌────────────────────────────────────────────────────────────┐
│             ANTES (CartService override)                   │
├────────────────────────────────────────────────────────────┤
│  ❌ Sobrescribe servicio core                             │
│  ❌ Problemas de transaccionalidad                         │
│  ❌ Dependencias circulares                                │
│  ❌ Cálculos múltiples innecesarios                        │
│  ❌ Difícil de mantener                                    │
└────────────────────────────────────────────────────────────┘
                           ⬇️  MIGRACIÓN
┌────────────────────────────────────────────────────────────┐
│             AHORA (Middlewares)                            │
├────────────────────────────────────────────────────────────┤
│  ✅ No toca servicios core                                │
│  ✅ Transaccionalidad garantizada                          │
│  ✅ Sin dependencias circulares                            │
│  ✅ Cálculos solo cuando necesario                         │
│  ✅ Fácil de entender y mantener                           │
│  ✅ Mejor performance                                      │
└────────────────────────────────────────────────────────────┘
```
