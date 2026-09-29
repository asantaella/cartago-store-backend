# Plan: aceptar `stock_location_code` en creación completa de productos

## Goal
Extender la validación de variantes de creación y actualización completa de productos para aceptar y persistir `stock_location_code` sin alterar la semántica de `undefined`, `null` ni las validaciones existentes.

## Current context / assumptions

- Workspace: `/home/parker/workspace/cartago-store-backend`.
- Rama inspeccionada: `feature/product-delivery-overwriting-default`.
- Medusa: `@medusajs/medusa` `^1.20.10`; TypeScript + Jest + TypeORM.
- Campo persistido en `src/models/product-variant.ts`:
  ```ts
  @Column({ type: "varchar", length: 4, nullable: true })
  stock_location_code: string | null;
  ```
- Migración existente: `src/migrations/1742032800001-AddStockLocationCodeToProductVariant.ts`; no modificarla porque la columna ya existe y es compatible.
- El soporte actual en `src/api/middlewares/product-variant-payload.ts` solo cubre la actualización individual de variante (`POST`/`PATCH /admin/products/:id/variants/:variant_id`).
- Los DTO anidados nativos de Medusa para creación y actualización completa (`ProductVariantReq`) no declaran `stock_location_code`; con `forbidNonWhitelisted` el campo explícito se rechaza antes de llegar a TypeORM.
- `undefined` enviado desde JavaScript desaparece al serializar JSON; el caso funcional relevante es que el campo omitido sea aceptado y deje la columna en `NULL` al crear.
- No editar `node_modules/`; sus DTOs son la referencia de versión instalada.

## Architecture / proposed approach

Ampliar los validadores nativos mediante `registerOverriddenValidators`, conservando el contrato completo de Medusa y redeclarando únicamente el DTO anidado de variante con `stock_location_code` adicional. Registrar un override para el DTO de creación (`AdminPostProductsReq`) y otro para el DTO de actualización completa (`AdminPostProductsProductReq`), reutilizando el mismo validador de código que ya usa la actualización individual.

La solución debe preservar los campos nativos de variantes (`title`, precios, opciones, inventario, dimensiones, metadata, etc.) y no convertir `undefined` en `null` durante actualización: omitido significa no modificar; `null` significa limpiar; cadena vacía solo se normaliza a `null` donde ya exista esa política.

## Step-by-step tasks

### 1. Confirmar los seams y capturar el fallo actual

**Archivo:** `src/api/middlewares/product-variant-payload.spec.ts`

1. Importar, solo para pruebas, las clases nativas exportadas:
   - `AdminPostProductsReq` desde `@medusajs/medusa/dist/api/routes/admin/products/create-product`.
   - `AdminPostProductsProductReq` desde `@medusajs/medusa/dist/api/routes/admin/products/update-product`.
2. Añadir un caso para creación completa con una variante que contenga `stock_location_code: "A1"` y verificar que actualmente `validator(AdminPostProductsReq, payload)` rechaza por propiedad no permitida.
3. Añadir el mismo caso para actualización completa con `validator(AdminPostProductsProductReq, payload)`.
4. Ejecutar:
   ```bash
   ./node_modules/.bin/jest --config jest.config.js --runInBand --runTestsByPath src/api/middlewares/product-variant-payload.spec.ts
   ```
   **Resultado esperado antes de implementar:** los dos nuevos tests fallan con un `MedusaError` de validación por propiedad no permitida; los 23 tests existentes siguen pasando.
5. No hacer commit de tests aislados si el flujo del equipo exige commits por slice; el commit del primer slice debe contener test rojo + implementación mínima posterior.

### 2. Crear una definición reutilizable del campo y de sus casos límite

**Archivo:** `src/api/middlewares/product-variant-payload.ts`

1. Mantener `STOCK_LOCATION_CODE_PATTERN` como única fuente del patrón:
   ```ts
   export const STOCK_LOCATION_CODE_PATTERN = /^[A-Z](?:[1-9]|[1-9][0-9]|100)$/;
   ```
2. Extraer, si hace falta para evitar repetir decorators, una clase/mezcla local para el DTO de variante extendido que añada exactamente:
   ```ts
   @IsOptional()
   @IsString()
   @Matches(STOCK_LOCATION_CODE_PATTERN)
   stock_location_code?: string | null;
   ```
3. No añadir `@IsNotEmpty()`, `@IsDefined()` ni coerción: `undefined` omitido y `null` deben seguir siendo válidos según la columna nullable y el comportamiento ya aprobado.
4. No tocar la semántica existente de `shipping_option_price_extra` ni sus normalizaciones.
5. Mantener el middleware POST/PATCH individual intacto salvo que la extracción evite duplicación real.

### 3. Implementar el override del DTO de creación completa

**Archivo:** `src/api/middlewares/product-variant-payload.ts`

1. Importar `AdminPostProductsReq` desde el módulo nativo de creación.
2. Definir un DTO extendido con el mismo nombre de constructor (`AdminPostProductsReq`) para que `registerOverriddenValidators` sustituya el validador nativo por nombre.
3. Redeclarar `variants` con `@IsOptional()`, `@IsArray()`, `@ValidateNested({ each: true })` y `@Type(() => ExtendedProductVariantReq)`.
4. Definir `ExtendedProductVariantReq` con todos los campos de `ProductVariantReq` de la versión instalada de Medusa y sus decorators nativos, más `stock_location_code`. No eliminar ni relajar ninguna regla nativa.
5. Registrar el override:
   ```ts
   registerOverriddenValidators(AdminPostProductsReq);
   ```
6. Ejecutar de nuevo el test rojo del task 1 y comprobar que el caso válido pasa.
7. Añadir y verificar estos casos:
   - variante sin `stock_location_code`: pasa;
   - `stock_location_code: undefined` en un objeto JavaScript antes de serializar: pasa como campo omitido;
   - `stock_location_code: null`: pasa;
   - `A1` y `Z100`: pasan;
   - `A0`, `A101`, `AA1`, `a1`, `A01`, `" A1 "`, número y objeto: fallan;
   - la variante conserva `title`, `prices`, `options` e inventario.

### 4. Implementar el override del DTO de actualización completa

**Archivo:** `src/api/middlewares/product-variant-payload.ts`

1. Importar `AdminPostProductsProductReq` desde el módulo nativo de actualización.
2. Definir el override con el mismo nombre de constructor.
3. Redeclarar `variants` usando el DTO local extendido de actualización, conservando `id`, campos opcionales, `prices` y `options` nativos.
4. Registrar:
   ```ts
   registerOverriddenValidators(AdminPostProductsProductReq);
   ```
5. Añadir tests que verifiquen:
   - variante sin campo: pasa y no introduce una propiedad artificial;
   - variante con `A1`: pasa;
   - `null`: pasa para limpiar;
   - valores inválidos: fallan;
   - el payload no pierde `id`, precios ni opciones.
6. Ejecutar la suite focalizada y verificar que no se rompe la validación existente de actualización individual.

### 5. Verificar que el campo llega al servicio y al almacenamiento

**Archivos:**
- `src/api/admin/products/route.ts`
- `src/models/product-variant.ts`
- `src/migrations/1742032800001-AddStockLocationCodeToProductVariant.ts`
- `src/api/middlewares/product-variant-payload.spec.ts`

1. Añadir un test de seam de servicio/route, sin conectar una base de datos real, que construya el payload validado de creación y compruebe que `productService.create` recibe la variante con `stock_location_code: "A1"` sin que el middleware la elimine.
2. Añadir una aserción separada para el payload omitido: no debe inventarse `stock_location_code: null` antes de persistir; la nulabilidad pertenece al modelo/base de datos.
3. Verificar por lectura que el modelo sigue usando `varchar(4), nullable: true` y que la migración no se modifica.
4. Si el seam de `route.ts` no permite una prueba estable sin Express completo, documentar la limitación y probar como mínimo el resultado exacto del `validator` más el objeto entregado al servicio mediante un mock de `productService.create`.

### 6. Verificación completa y commit atómico

Ejecutar desde `/home/parker/workspace/cartago-store-backend`:

```bash
./node_modules/.bin/jest --config jest.config.js --runInBand --runTestsByPath src/api/middlewares/product-variant-payload.spec.ts
./node_modules/.bin/tsc --noEmit -p tsconfig.json
 git diff --check
```

Resultados esperados:

- Jest: suite focalizada en estado `PASS`, incluyendo todos los casos de creación, actualización, omisión, `null` y límites del patrón.
- TypeScript: exit code `0`.
- `git diff --check`: sin salida y exit code `0`.

Después de verificar, revisar el diff para confirmar que solo contiene el override, los tests y cualquier extracción necesaria. Crear un commit atómico convencional, por ejemplo:

```bash
git add src/api/middlewares/product-variant-payload.ts src/api/middlewares/product-variant-payload.spec.ts
git commit -m "fix(product): accept stock location in full variant payloads"
```

No incluir `dist/` en el commit salvo que la política de despliegue del repositorio lo exija explícitamente. Si se ejecuta `yarn build:server`, verificar los artefactos generados y reportarlos aparte.

## Tests / validation

La estrategia es TDD vertical:

1. Test de creación completa con código válido → rojo por `forbidNonWhitelisted` → override mínimo → verde.
2. Test de actualización completa con código válido → rojo → override mínimo → verde.
3. Casos de omisión/`undefined`/`null` → rojo solo si la semántica cambia → ajuste mínimo → verde.
4. Límites válidos e inválidos del patrón → verde sin cambiar la expresión existente.
5. Preservación de campos nativos y forwarding al servicio → verde.
6. TypeScript, suite focalizada y `git diff --check` como gate final.

Cada slice debe ejecutarse y revisarse antes del siguiente; no escribir todos los tests y luego implementar en bloque.

## Risks, tradeoffs, and open questions

- **Riesgo principal:** `ProductVariantReq` es una clase interna no exportada por Medusa. El override tendrá que replicar sus propiedades/decorators o usar una técnica compatible con `class-transformer`; no se debe editar `node_modules`.
- **Compatibilidad de nombres:** `registerOverriddenValidators` indexa por `constructor.name`; los overrides deben conservar exactamente `AdminPostProductsReq` y `AdminPostProductsProductReq`.
- **Riesgo de regresión:** una réplica incompleta del DTO anidado puede dejar de aceptar campos nativos. Los tests deben incluir precios, opciones, inventario y dimensiones, no solo `stock_location_code`.
- **Semántica de vacío:** para creación completa, no normalizar `""` a `null` a menos que el contrato de producto lo requiera explícitamente. La normalización existente de `""` está limitada al middleware de variante individual.
- **Migraciones:** no crear ni editar una migración; la columna nullable ya está desplegada en el código revisado.
- **Runtime:** este backend ejecuta `dist`; tras implementar, habrá que ejecutar `yarn build:server` y reiniciar Medusa antes de validar manualmente el Dashboard. Eso pertenece a la fase de ejecución, no a este plan.
- **Pregunta abierta para el implementador:** confirmar mediante un test de integración del router si la ruta custom `src/api/admin/products/route.ts` intercepta siempre la creación o si el caso afectado alcanza la ruta nativa de Medusa. La solución debe cubrir el validador nativo sin depender del orden accidental de montaje de rutas.
