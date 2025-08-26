# Guía de Interfaces, Clases y Servicios de Medusa.js

Esta guía documenta las principales interfaces, clases y servicios de las librerías de Medusa.js para el desarrollo de ecommerce.

## Tabla de Contenido

1. [Medusa.js Client](#medusa-js-client)
2. [Medusa Core](#medusa-core)
3. [Medusa Types](#medusa-types)
4. [Medusa Utils](#medusa-utils)
5. [Ejemplos de Uso](#ejemplos-de-uso)

---

## 1. Medusa.js Client

### 1.1 Cliente Principal

```typescript
interface Config {
  baseUrl: string;
  maxRetries: number;
  apiKey?: string;
  publishableApiKey?: string;
  customHeaders?: Record<string, any>;
  axiosAdapter?: AxiosAdapter;
}

interface RequestOptions {
  timeout?: number;
  numberOfRetries?: number;
}

class Client {
  constructor(config: Config);
  request(
    method: RequestMethod,
    path: string,
    payload?: Record<string, any>,
    options?: RequestOptions,
    customHeaders?: Record<string, any>
  ): Promise<any>;
}
```

### 1.2 Gestión de Claves API

```typescript
class KeyManager {
  registerPublishableApiKey(key: string): void;
  getPublishableApiKey(): string | null;
}
```

### 1.3 Manejo de Errores

```typescript
class MedusaError extends Error {
  constructor();
  static factory(type: ErrorType): MedusaError;
}

enum ErrorType {
  INVALID_REQUEST = 0,
  API = 1,
  AUTHENTICATION = 2,
  PERMISSION = 3,
  CONNECTION = 4,
}
```

---

## 2. Medusa Core

### 2.1 Servicios Principales

La librería de Medusa Core proporciona una amplia gama de servicios:

```typescript
// Servicios de autenticación y usuarios
export { default as AuthService } from "./auth";
export { default as UserService } from "./user";

// Servicios de productos
export { default as ProductService } from "./product";
export { default as ProductVariantService } from "./product-variant";
export { default as ProductCategoryService } from "./product-category";
export { default as ProductCollectionService } from "./product-collection";
export { default as ProductTypeService } from "./product-type";

// Servicios de carrito y órdenes
export { default as CartService } from "./cart";
export { default as OrderService } from "./order";
export { default as OrderEditService } from "./order-edit";
export { default as DraftOrderService } from "./draft-order";

// Servicios de clientes
export { default as CustomerService } from "./customer";
export { default as CustomerGroupService } from "./customer-group";

// Servicios de pricing y descuentos
export { default as PricingService } from "./pricing";
export { default as PriceListService } from "./price-list";
export { default as DiscountService } from "./discount";

// Servicios de fulfillment y shipping
export { default as FulfillmentService } from "./fulfillment";
export { default as ShippingOptionService } from "./shipping-option";
export { default as ShippingProfileService } from "./shipping-profile";

// Servicios de pagos
export { default as PaymentService } from "./payment";
export { default as PaymentProviderService } from "./payment-provider";
export { default as PaymentCollectionService } from "./payment-collection";

// Servicios de inventario
export { default as ProductVariantInventoryService } from "./product-variant-inventory";
export { default as SalesChannelInventoryService } from "./sales-channel-inventory";

// Otros servicios importantes
export { default as RegionService } from "./region";
export { default as TaxProviderService } from "./tax-provider";
export { default as TaxRateService } from "./tax-rate";
export { default as NotificationService } from "./notification";
export { default as EventBusService } from "./event-bus";
export { default as SearchService } from "./search";
export { default as StoreService } from "./store";
```

---

## 3. Medusa Types

### 3.1 Interfaces Comunes

#### BaseEntity

```typescript
interface BaseEntity {
  id: string;
  created_at: Date;
  updated_at: Date;
}

interface SoftDeletableEntity extends BaseEntity {
  deleted_at: Date | null;
}
```

#### FindConfig

```typescript
interface FindConfig<Entity> {
  select?: (keyof Entity | string)[];
  skip?: number | null | undefined;
  take?: number | null | undefined;
  relations?: string[];
  order?: {
    [K: string]: "ASC" | "DESC";
  };
  withDeleted?: boolean;
  filters?: Record<string, any>;
}
```

#### RequestQueryFields

```typescript
type RequestQueryFields = {
  expand?: string;
  fields?: string;
  offset?: number;
  limit?: number;
  order?: string;
};
```

#### PaginatedResponse

```typescript
type PaginatedResponse<T = unknown> = {
  limit: number;
  offset: number;
  count: number;
} & T;
```

#### DeleteResponse

```typescript
type DeleteResponse<T = string> = {
  id: string;
  object: T;
  deleted: boolean;
};
```

### 3.2 Operadores de Comparación

```typescript
interface DateComparisonOperator {
  lt?: Date;
  gt?: Date;
  gte?: Date;
  lte?: Date;
}

interface StringComparisonOperator {
  lt?: string;
  gt?: string;
  gte?: string;
  lte?: string;
  contains?: string;
  starts_with?: string;
  ends_with?: string;
}

interface NumericalComparisonOperator {
  lt?: number;
  gt?: number;
  gte?: number;
  lte?: number;
}
```

### 3.3 Tipos de Producto

```typescript
enum ProductStatus {
  DRAFT = "draft",
  PROPOSED = "proposed",
  PUBLISHED = "published",
  REJECTED = "rejected",
}

interface ProductDTO {
  id: string;
  title: string;
  handle?: string | null;
  subtitle?: string | null;
  description?: string | null;
  is_giftcard: boolean;
  status: ProductStatus;
  thumbnail?: string | null;
  width?: number | null;
  weight?: number | null;
  length?: number | null;
  height?: number | null;
  origin_country?: string | null;
  hs_code?: string | null;
  mid_code?: string | null;
  material?: string | null;
  collection?: ProductCollectionDTO | null;
  collection_id?: string | null;
  categories?: ProductCategoryDTO[] | null;
  type?: ProductTypeDTO | null;
  type_id?: string | null;
  tags: ProductTagDTO[];
  variants: ProductVariantDTO[];
  options: ProductOptionDTO[];
  images: ProductImageDTO[];
  discountable?: boolean;
  external_id?: string | null;
  created_at?: string | Date;
  updated_at?: string | Date;
  deleted_at?: string | Date;
  metadata?: Record<string, unknown>;
}

interface ProductVariantDTO {
  id: string;
  title: string;
  sku?: string | null;
  barcode?: string | null;
  ean?: string | null;
  upc?: string | null;
  inventory_quantity: number;
  allow_backorder?: boolean;
  manage_inventory?: boolean;
  hs_code?: string | null;
  origin_country?: string | null;
  mid_code?: string | null;
  material?: string | null;
  weight?: number | null;
  length?: number | null;
  height?: number | null;
  width?: number | null;
  options: ProductOptionValueDTO[];
  metadata?: Record<string, unknown> | null;
  product?: ProductDTO | null;
  product_id?: string | null;
  variant_rank?: number | null;
  created_at: string | Date;
  updated_at: string | Date;
  deleted_at: string | Date;
}
```

### 3.4 Tipos de Carrito

```typescript
interface CartDTO {
  id: string;
  customer_id?: string;
  sales_channel_id?: string;
  region_id?: string;
  currency_code: string;
  email?: string;
  billing_address?: CartAddressDTO;
  shipping_address?: CartAddressDTO;
  items: CartLineItemDTO[];
  shipping_methods?: CartShippingMethodDTO[];
  payment_sessions?: any[];
  metadata?: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CartLineItemDTO {
  id: string;
  cart_id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  quantity: number;
  product_id?: string;
  product_title?: string;
  product_description?: string;
  product_subtitle?: string;
  product_type?: any;
  product_collection?: any;
  product_handle?: string;
  variant_id?: string;
  variant_sku?: string;
  variant_title?: string;
  unit_price: BigNumberValue;
  tax_lines?: LineItemTaxLineDTO[];
  adjustments?: LineItemAdjustmentDTO[];
  metadata?: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CartAddressDTO {
  id: string;
  customer_id?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  company?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  country_code?: string;
  province?: string;
  postal_code?: string;
  metadata?: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CartShippingMethodDTO {
  id: string;
  cart_id: string;
  name: string;
  description?: string;
  amount: BigNumberValue;
  is_tax_inclusive: boolean;
  shipping_option_id?: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  tax_lines?: ShippingMethodTaxLineDTO[];
  adjustments?: ShippingMethodAdjustmentDTO[];
  created_at: Date | string;
  updated_at: Date | string;
}
```

### 3.5 Líneas de Ajuste y Tax

```typescript
interface AdjustmentLineDTO {
  id: string;
  code?: string;
  amount: BigNumberValue;
  raw_amount: BigNumberRawValue;
  cart_id: string;
  description?: string;
  promotion_id?: string;
  provider_id?: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface TaxLineDTO {
  id: string;
  description?: string;
  tax_rate_id?: string;
  code: string;
  rate: number;
  provider_id?: string;
  created_at: Date | string;
  updated_at: Date | string;
}
```

---

## 4. Medusa Utils

### 4.1 Funciones de Utilidad Comunes

```typescript
// Manejo de arrays
export * from "./array-difference";
export * from "./deduplicate";
export * from "./group-by";
export * from "./partition-array";

// Transformaciones de strings
export * from "./camel-to-snake-case";
export * from "./to-camel-case";
export * from "./to-kebab-case";
export * from "./to-pascal-case";
export * from "./upper-case-first";
export * from "./lower-case-first";

// Validaciones
export * from "./is-big-number";
export * from "./is-date";
export * from "./is-defined";
export * from "./is-email";
export * from "./is-object";
export * from "./is-present";
export * from "./is-string";

// Manejo de objetos
export * from "./deep-copy";
export * from "./deep-equal-obj";
export * from "./pick-deep";
export * from "./remove-nullish";
export * from "./remove-undefined";
export * from "./set-metadata";

// Generadores
export * from "./generate-entity-id";
export * from "./simple-hash";

// Manejo de errores
export * from "./errors";
export * from "./handle-postgres-database-error";

// Contenedores y dependencias
export * from "./container";
export * from "./medusa-container";

// Query building
export * from "./build-query";
export * from "./string-to-select-relation-object";

// Transacciones
export * from "./transaction";
export * from "./wrap-handler";
```

### 4.2 Interfaces de Error

```typescript
// Desde @medusajs/utils/errors
interface MedusaError extends Error {
  type: string;
  code?: string;
  date?: Date;
}

// Tipos de errores comunes
class DatabaseError extends MedusaError {}
class InvalidDataError extends MedusaError {}
class NotFoundError extends MedusaError {}
class DuplicateError extends MedusaError {}
class UnexpectedStateError extends MedusaError {}
```

---

## 5. Ejemplos de Uso

### 5.1 Inicialización del Cliente Medusa.js

```typescript
import Medusa from "@medusajs/medusa-js";

const medusa = new Medusa({
  baseUrl: "http://localhost:9000",
  maxRetries: 3,
  publishableApiKey: "pk_test_...",
  customHeaders: {
    "X-Custom-Header": "value",
  },
});
```

### 5.2 Trabajando con Productos

```typescript
// Obtener productos
const products = await medusa.products.list({
  limit: 20,
  offset: 0,
  expand: "variants,images",
});

// Crear un producto (requiere autenticación admin)
const newProduct = await medusa.admin.products.create({
  title: "Nueva Camiseta",
  description: "Una camiseta increíble",
  handle: "nueva-camiseta",
  status: ProductStatus.PUBLISHED,
  variants: [
    {
      title: "Talla M",
      prices: [
        {
          currency_code: "usd",
          amount: 2500,
        },
      ],
    },
  ],
});
```

### 5.3 Gestión de Carrito

```typescript
// Crear carrito
const cart = await medusa.carts.create({
  region_id: "reg_123",
  currency_code: "usd",
});

// Agregar item al carrito
await medusa.carts.lineItems.create(cart.cart.id, {
  variant_id: "variant_123",
  quantity: 2,
});

// Completar carrito
const order = await medusa.carts.complete(cart.cart.id);
```

### 5.4 Usando Tipos para Validación

```typescript
import { ProductDTO, FindConfig } from "@medusajs/types";

// Función tipada para buscar productos
async function findProducts(
  config: FindConfig<ProductDTO>
): Promise<ProductDTO[]> {
  return await productService.list(config);
}

// Uso con autocompletado
const products = await findProducts({
  select: ["id", "title", "handle"],
  relations: ["variants", "images"],
  take: 10,
  order: { created_at: "DESC" },
});
```

### 5.5 Manejo de Errores

```typescript
import { MedusaError } from "@medusajs/medusa-js";

try {
  const product = await medusa.products.retrieve("invalid-id");
} catch (error) {
  if (error instanceof MedusaError) {
    console.log("Error tipo:", error.type);
    console.log("Mensaje:", error.message);

    switch (error.type) {
      case "not_found":
        // Manejar producto no encontrado
        break;
      case "invalid_data":
        // Manejar datos inválidos
        break;
      default:
        // Manejar otros errores
        break;
    }
  }
}
```

### 5.6 Usando Utilidades

```typescript
import {
  isDefined,
  isObject,
  deepCopy,
  toCamelCase,
  generateEntityId,
} from "@medusajs/utils";

// Validaciones
if (isDefined(product.variant) && isObject(product.variant)) {
  // Producto tiene variante válida
}

// Transformaciones
const camelCaseData = toCamelCase(snake_case_data);
const copiedProduct = deepCopy(originalProduct);

// Generar IDs
const newId = generateEntityId("prod");
```

---

## Recursos Adicionales

- [Documentación Oficial de Medusa](https://docs.medusajs.com)
- [API Reference](https://docs.medusajs.com/api/admin)
- [Medusa.js Client Documentation](https://docs.medusajs.com/js-client/overview)
- [Guía de Desarrollo de Plugins](https://docs.medusajs.com/development/plugins/create)

---

## Notas

- Todas las interfaces están tipadas con TypeScript para mejor experiencia de desarrollo
- Las funciones async/await son la forma recomendada de trabajar con las APIs
- Los servicios core requieren autenticación apropiada (API keys o tokens JWT)
- Usa los tipos de Medusa Types para validación y autocompletado
- Las utilidades proveen funciones comunes para evitar reimplementar lógica básica

Este documento serve como referencia rápida para trabajar con el ecosistema de Medusa.js en el desarrollo de aplicaciones de ecommerce.
