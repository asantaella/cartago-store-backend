# Instrucciones para Copilot - Medusa.js v1.20.11 Backend

## Información General del Proyecto

Este es un backend construido con **Medusa.js v1.20.11**, una plataforma de comercio electrónico headless construida con Node.js y Express. El proyecto utiliza TypeScript como lenguaje principal.

## Arquitectura de Medusa v1

### Capas de la Arquitectura

Medusa sigue una arquitectura en capas:

1. **Capa HTTP (API Routes)**: Punto de entrada basado en Express.js
2. **Capa de Workflows**: Lógica de negocio opinada de la aplicación
3. **Capa de Módulos**: Módulos específicos del dominio para gestión de recursos
4. **Capa de Base de Datos**: Base de datos PostgreSQL

### Estructura de Directorios

```
├── src/
│   ├── admin/           # Customizaciones del Admin
│   │   ├── widgets/     # Widgets personalizados del Admin
│   │   └── routes/      # Rutas personalizadas del Admin UI
│   ├── api/             # Rutas API personalizadas
│   ├── loaders/         # Scripts que se ejecutan al iniciar el backend
│   ├── migrations/      # Scripts de migración de base de datos
│   ├── models/          # Entidades personalizadas (tablas de BD)
│   ├── repositories/    # Repositorios personalizados
│   ├── services/        # Servicios personalizados
│   └── subscribers/     # Suscriptores de eventos personalizados
├── medusa-config.js     # Configuración del backend
├── package.json         # Dependencias NPM
└── uploads/             # Archivos subidos (si usas Local File Service)
```

## Desarrollo de Servicios

### Crear un Servicio Personalizado

**Ubicación**: `src/services/`
**Nombre del archivo**: Sin sufijo "Service" (ej: `post.ts` para `PostService`)

```typescript
import { TransactionBaseService } from "@medusajs/medusa";
import { Lifetime } from "awilix";

class PostService extends TransactionBaseService {
  static LIFE_TIME = Lifetime.SCOPED; // Por defecto para servicios personalizados

  protected postRepository_: typeof PostRepository;

  constructor(container) {
    super(container);
    this.postRepository_ = container.postRepository;
  }

  async create(data: CreatePostData): Promise<Post> {
    return this.atomicPhase_(async (manager) => {
      const postRepo = manager.withRepository(this.postRepository_);
      const post = postRepo.create(data);
      return await postRepo.save(post);
    });
  }

  async list(
    selector?: Selector<Post>,
    config: FindConfig<Post> = {}
  ): Promise<Post[]> {
    const postRepo = this.activeManager_.withRepository(this.postRepository_);
    const query = buildQuery(selector, config);
    return postRepo.find(query);
  }
}

export default PostService;
```

### Características Clave de los Servicios

- **Heredan de `TransactionBaseService`**
- **Inyección de dependencias** a través del constructor
- **Transacciones** con `atomicPhase_`
- **Acceso a repositorios** con `activeManager_.withRepository()`
- **Paginación y filtrado** con `buildQuery()`

### Uso de Servicios

**En otro servicio**:

```typescript
constructor(container) {
  super(container)
  this.postService = container.postService
}
```

**En una ruta API**:

```typescript
const postService = req.scope.resolve("postService");
```

**En un subscriber**:

```typescript
const postService: PostService = container.resolve("postService");
```

## Desarrollo de Subscribers (Suscriptores de Eventos)

### Crear un Subscriber

**Ubicación**: `src/subscribers/`

```typescript
import {
  ProductService,
  type SubscriberConfig,
  type SubscriberArgs,
} from "@medusajs/medusa";

export default async function productUpdateHandler({
  data,
  eventName,
  container,
  pluginOptions,
}: SubscriberArgs<Record<string, any>>) {
  const productService: ProductService = container.resolve("productService");

  const { id } = data;
  const product = await productService.retrieve(id);

  // Lógica de manejo del evento
  console.log(`Producto actualizado: ${product.title}`);
}

export const config: SubscriberConfig = {
  event: ProductService.Events.UPDATED, // o array de eventos
  context: {
    subscriberId: "product-update-handler",
  },
};
```

### Eventos Principales Disponibles

**Eventos de Productos**:

- `product.created`
- `product.updated`
- `product.deleted`

**Eventos de Pedidos**:

- `order.placed`
- `order.updated`
- `order.canceled`
- `order.completed`
- `order.fulfillment_created`

**Eventos de Carrito**:

- `cart.created`
- `cart.updated`
- `cart.customer_transferred`

**Eventos de Cliente**:

- `customer.created`
- `customer.updated`
- `customer.deleted`

**Eventos de Pago**:

- `payment.captured`
- `payment.refunded`

## Desarrollo de API Routes Personalizadas

### Estructura de Rutas

**Ubicación**: `src/api/`

```typescript
// src/api/posts/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const postService = req.scope.resolve("postService");

  const posts = await postService.list();

  res.json({ posts });
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const postService = req.scope.resolve("postService");

  const post = await postService.create(req.body);

  res.json({ post });
};
```

### Rutas con Parámetros

```typescript
// src/api/posts/[id]/route.ts
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;
  const postService = req.scope.resolve("postService");

  const post = await postService.retrieve(id);

  res.json({ post });
};
```

## Contenedor de Dependencias

### Recursos Registrados

Medusa registra automáticamente estos recursos:

- **Servicios**: Registrados en camelCase (`productService`, `orderService`)
- **Repositorios**: Registrados en camelCase (`productRepository`)
- **Entity Manager**: `manager`
- **Logger**: `logger`
- **Configuraciones**: `configModule`

### Resolución de Dependencias

**En clases (servicios, etc.)**:

```typescript
constructor({ productService, logger }) {
  this.productService = productService
  this.logger = logger
}
```

**En API Routes**:

```typescript
const productService = req.scope.resolve("productService");
```

**En subscribers**:

```typescript
const productService = container.resolve("productService");
```

## APIs Disponibles

### Store API (Frontend/Storefront)

- **Prefijo**: `/store`
- **Uso**: Crear storefronts, aplicaciones móviles
- **Autenticación**: JWT Token o Cookie Session
- **Ejemplos**:
  - `GET /store/products` - Listar productos
  - `POST /store/carts` - Crear carrito
  - `POST /store/auth` - Autenticar cliente

### Admin API (Panel de Administración)

- **Prefijo**: `/admin`
- **Uso**: Funcionalidades administrativas
- **Autenticación**: API Token, JWT Token o Cookie Session
- **Ejemplos**:
  - `GET /admin/products` - Gestionar productos
  - `POST /admin/orders/{id}/fulfill` - Fulfillment de pedidos
  - `GET /admin/customers` - Gestionar clientes

### Parámetros de Query Comunes

**Paginación**:

- `limit` - Número máximo de elementos
- `offset` - Elementos a saltar
- `order` - Campo de ordenamiento (ej: `created_at`, `-created_at`)

**Expansión de relaciones**:

- `expand` - Incluir relaciones (ej: `variants,collection`)

**Selección de campos**:

- `fields` - Campos específicos a retornar (ej: `title,handle`)

## Mejores Prácticas

### Gestión de Errores

```typescript
import { MedusaError } from "@medusajs/utils";

// En servicios
if (!post) {
  throw new MedusaError(MedusaError.Types.NOT_FOUND, "Post was not found");
}
```

### Transacciones

```typescript
// Siempre usar transacciones para operaciones de escritura
return this.atomicPhase_(async (manager) => {
  const postRepo = manager.withRepository(this.postRepository_);
  // Operaciones de base de datos
  return await postRepo.save(post);
});
```

### Configuraciones

```typescript
// Acceder a configuraciones del medusa-config.js
const configModule = container.resolve("configModule");
```

### Build del Proyecto

```bash
# Compilar TypeScript a JavaScript
npm run build

# Desarrollo con recarga automática
npm run dev
# o
medusa develop
```

## Comandos Importantes

```bash
# Iniciar backend
npm start
# o
medusa start

# Desarrollo
npm run dev
# o
medusa develop

# Migraciones
medusa migrations run

# Seed data
npm run seed

# Build
npm run build
```

## Consideraciones Especiales

1. **Los archivos deben estar transpilados** en `dist/` para funcionar en producción
2. **Los servicios personalizados** tienen lifetime `SCOPED` por defecto
3. **Los nombres de archivos** determinan el registro en el contenedor
4. **Las transacciones** son esenciales para mantener consistencia de datos
5. **Los subscribers** deben tener IDs únicos para evitar conflictos

## Debugging

- Usa `logger` para logging en lugar de `console.log`
- Los errores en subscribers no interrumpen las operaciones principales
- Revisa los logs para problemas de inyección de dependencias (`AwilixResolutionError`)
