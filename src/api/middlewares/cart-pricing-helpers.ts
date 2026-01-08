import { MedusaRequest } from "@medusajs/medusa";
import { NextFunction } from "express";
import SpanishTaxService from "../../services/spanish-tax";

// ============================================================================
// TIPOS COMUNES
// ============================================================================

export type LineItemEntity = {
  id: string;
  unit_price: number;
  discount_total?: number;
  quantity?: number;
  metadata?: Record<string, unknown> & { adjusted_unit_price?: number };
  subtotal?: number;
  adjustments?: Array<{ description?: string; amount?: number }>;
};

export type LineItemAdjustmentEntity = {
  id: string;
  line_item_id: string;
  description?: string;
  discount_id?: string;
  amount: number;
  metadata?: Record<string, unknown>;
};

export type ShippingMethodEntity = {
  id: string;
  price: number;
  data?: Record<string, unknown> & { adjusted_price?: number };
};

export type PaymentSessionEntity = {
  id: string;
  amount: number;
  provider_id: string;
  data?: Record<string, unknown>;
};

export type GiftCardTransaction = {
  id: string;
  gift_card_id: string;
  amount: number;
  [key: string]: unknown;
};

export type CartEntity = {
  id: string;
  type?: string;
  items?: LineItemEntity[];
  shipping_methods?: ShippingMethodEntity[];
  shipping_address?: { postal_code?: string };
  payment_sessions?: PaymentSessionEntity[];
  gift_card_transactions?: GiftCardTransaction[];
  discounts?: Array<{ code?: string; rule?: Record<string, unknown> }>;
  region?: {
    tax_rate?: number;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown> & {
    territory_type?: string;
    prices_adjusted?: boolean;
  };
  subtotal?: number;
  shipping_total?: number;
  tax_total?: number;
  tax_rate?: number;
  discount_total?: number;
  gift_card_total?: number;
  total?: number;
};

export type Repository<T> = {
  findOne: (opts: {
    where: { id: string };
    relations?: string[];
  }) => Promise<T | undefined>;
  save: (entity: Partial<T>) => Promise<T>;
  find?: (opts?: any) => Promise<T[]>;
  remove?: (entity: T) => Promise<T>;
  update?: (id: string, data: Partial<T>) => Promise<void>;
  delete?: (id: string) => Promise<void>;
};

export type TransactionManager = {
  getRepository: <T>(name: string) => Repository<T>;
};

export type Manager = {
  transaction: <T>(
    fn: (transactionalManager: TransactionManager) => Promise<T>
  ) => Promise<T>;
  getRepository: <T>(name: string) => Repository<T>;
};

export interface TaxContext {
  postalCode: string;
  isTaxExempt: boolean;
  territoryType: string;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const IVA_RATE = 1.21;
const LOG_PREFIX = "[cart-pricing-middleware]";

// ============================================================================
// CÁLCULO DE PRECIOS
// ============================================================================

/**
 * Calcula precio sin IVA (trabaja con centavos - integers)
 * Recibe precio en centavos (ej: 1000 = 10.00€) y devuelve precio sin IVA en centavos
 */
export function calculatePriceWithoutTax(priceInCents: number): number {
  return priceInCents / IVA_RATE;
}

/**
 * Calcula impuestos del IVA 21% (trabaja con centavos)
 */
export function calculateTaxAmount(priceInCents: number): number {
  return priceInCents * 0.21;
}

/**
 * Calcula el descuento ajustado para un precio base (sin IVA)
 */
export function adjustDiscountForTaxExempt(discountInCents: number): number {
  return discountInCents / IVA_RATE;
}

/**
 * Calcula y redondea el precio ajustado sin IVA
 */
export function getAdjustedPrice(priceWithTax: number): number {
  return Math.round(calculatePriceWithoutTax(priceWithTax));
}

/**
 * Calcula el descuento ajustado proporcionalmente al cambio de precio
 * Fórmula: adjustedDiscount = originalDiscount * (adjustedPrice / originalPrice)
 */
export function calculateAdjustedDiscount(
  originalDiscount: number,
  originalPrice: number,
  adjustedPrice: number
): number {
  if (originalDiscount <= 0 || originalPrice <= 0) {
    return 0;
  }
  const priceRatio = adjustedPrice / originalPrice;
  return Math.round(originalDiscount * priceRatio);
}

// ============================================================================
// VALIDACIONES COMUNES
// ============================================================================

/**
 * Verifica si un valor numérico es válido para cálculos de precio
 */
export function isValidPrice(value: unknown): value is number {
  return typeof value === "number" && isFinite(value) && value >= 0;
}

/**
 * Verifica si dos precios son significativamente diferentes (tolerancia de 1 centavo)
 */
export function pricesAreDifferent(
  price1: number,
  price2: number,
  tolerance = 1
): boolean {
  return Math.abs(price1 - price2) > tolerance;
}

/**
 * Extrae el contexto fiscal de un carrito basado en su código postal
 */
export function getTaxContext(
  cart: CartEntity,
  spanishTaxService: SpanishTaxService
): TaxContext | null {
  const postalCode = cart.shipping_address?.postal_code;
  if (!postalCode) return null;

  return {
    postalCode,
    isTaxExempt: spanishTaxService.isTaxExemptAddress(postalCode),
    territoryType: spanishTaxService.getTerritoryType(postalCode),
  };
}

/**
 * Resuelve el servicio de impuestos españoles desde el scope de la request
 */
export function resolveSpanishTaxService(
  req: MedusaRequest
): SpanishTaxService | null {
  try {
    return req.scope.resolve("spanishTaxService") as SpanishTaxService;
  } catch {
    logError("Failed to resolve spanishTaxService");
    return null;
  }
}

/**
 * Resuelve el manager de transacciones desde el scope de la request
 */
export function resolveManager(req: MedusaRequest): Manager | null {
  try {
    return req.scope.resolve("manager") as unknown as Manager;
  } catch {
    logError("Failed to resolve manager");
    return null;
  }
}

// ============================================================================
// TRANSFORMACIONES DE ITEMS
// ============================================================================

/**
 * Obtiene el precio ajustado de un line item
 * Prioriza el valor de metadata, si no existe lo calcula
 */
export function getLineItemAdjustedPrice(item: LineItemEntity): number {
  const metadataPrice = item.metadata?.adjusted_unit_price;
  if (isValidPrice(metadataPrice)) {
    return Math.round(metadataPrice);
  }
  return getAdjustedPrice(item.unit_price);
}

/**
 * Calcula el descuento ajustado proporcionalmente al cambio de precio
 * Fórmula: adjustedDiscount = originalDiscount * (adjustedPrice / originalPrice)
 */
export function getLineItemAdjustedDiscount(item: LineItemEntity): number {
  const originalPrice = item.unit_price;
  const adjustedPrice = getLineItemAdjustedPrice(item);

  // Obtener el descuento original desde adjustments si existen, si no desde discount_total
  const originalDiscount =
    calculateDiscountFromAdjustments((item as any).adjustments) ||
    item.discount_total ||
    0;

  if (originalDiscount <= 0) {
    return 0;
  }

  // Calcular la proporción del ajuste de precio
  const priceRatio = adjustedPrice / originalPrice;

  // Ajustar el descuento proporcionalmente
  return Math.round(originalDiscount * priceRatio);
}

/**
 * Obtiene el precio ajustado de un método de envío
 * Prioriza el valor de data, si no existe lo calcula
 */
export function getShippingMethodAdjustedPrice(
  method: ShippingMethodEntity
): number {
  const dataPrice = method.data?.adjusted_price;
  if (isValidPrice(dataPrice)) {
    return Math.round(dataPrice);
  }
  return getAdjustedPrice(method.price);
}

/**
 * Calcula el subtotal de todos los items (precio ajustado × cantidad)
 */
export function calculateItemsSubtotal(
  items: LineItemEntity[],
  useAdjustedPrices: boolean
): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    const price = useAdjustedPrices
      ? getLineItemAdjustedPrice(item)
      : item.unit_price;
    return sum + price * (item.quantity || 1);
  }, 0);
}

/**
 * Calcula el total de envío
 */
export function calculateShippingTotal(
  methods: ShippingMethodEntity[],
  useAdjustedPrices: boolean
): number {
  if (!Array.isArray(methods)) return 0;
  return methods.reduce((sum, method) => {
    const price = useAdjustedPrices
      ? getShippingMethodAdjustedPrice(method)
      : method.price;
    return sum + price;
  }, 0);
}

/**
 * Calcula el descuento total de todos los items
 */
export function calculateTotalDiscount(items: LineItemEntity[]): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => sum + (item.discount_total || 0), 0);
}

/**
 * Calcula el descuento de un item desde sus adjustments
 * En Medusa, los descuentos se almacenan en adjustments con description: "discount"
 */
export function calculateDiscountFromAdjustments(
  adjustments?: Array<{ description?: string; amount?: number }>
): number {
  if (!Array.isArray(adjustments)) return 0;
  return adjustments.reduce((sum, adj) => {
    if (adj.description === "discount" && adj.amount) {
      return sum + Math.abs(adj.amount);
    }
    return sum;
  }, 0);
}

/**
 * Calcula el total de gift cards aplicados al carrito
 */
export function calculateGiftCardTotal(
  transactions?: GiftCardTransaction[]
): number {
  if (!Array.isArray(transactions)) return 0;
  return transactions.reduce(
    (sum, transaction) => sum + (transaction.amount || 0),
    0
  );
}

/**
 * Ajusta el gift_card_total para una región tax-exempt
 */

// ============================================================================
// LOGGING
// ============================================================================

export function log(message: string, ...args: unknown[]): void {
  console.log(`${LOG_PREFIX} ${message}`, ...args);
}

export function logError(message: string, error?: unknown): void {
  const errorMsg = error instanceof Error ? error.message : String(error || "");
  console.error(`${LOG_PREFIX} ${message}`, errorMsg ? `: ${errorMsg}` : "");
}

export function logCartOperation(
  operation: string,
  cartId: string,
  details: Record<string, unknown>
): void {
  const detailsStr = Object.entries(details)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  log(`${operation} cart ${cartId} - ${detailsStr}`);
}

export function logPriceChange(
  entityType: string,
  entityId: string,
  originalPrice: number,
  adjustedPrice: number
): void {
  log(
    `${entityType} ${entityId}: ${originalPrice} cents (${(
      originalPrice / 100
    ).toFixed(2)}€) → ${adjustedPrice} cents (${(adjustedPrice / 100).toFixed(
      2
    )}€)`
  );
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Ejecuta una función de middleware con manejo de errores estandarizado
 */
export async function safeMiddlewareExecution(
  operationName: string,
  operation: () => Promise<void>,
  next: NextFunction,
  continueOnError = true
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    logError(`Error in ${operationName}`, error);
    if (continueOnError) {
      next();
    } else {
      throw error;
    }
  }
}

/**
 * Envuelve una función de transformación de respuesta JSON con manejo de errores
 */
export function safeJsonTransform<T>(
  transform: (body: T) => T,
  operationName: string
): (body: T) => T {
  return (body: T) => {
    try {
      return transform(body);
    } catch (error) {
      logError(`Error in ${operationName}`, error);
      return body;
    }
  };
}

// ============================================================================
// OPERACIONES DE BASE DE DATOS
// ============================================================================

/**
 * Carga un carrito con sus relaciones desde la base de datos
 */
export async function loadCartWithRelations(
  transactionalManager: TransactionManager,
  cartId: string,
  relations: string[] = [
    "items",
    "shipping_methods",
    "shipping_address",
    "region",
  ]
): Promise<CartEntity | null> {
  const cartRepo = transactionalManager.getRepository<CartEntity>("Cart");
  const cart = await cartRepo.findOne({ where: { id: cartId }, relations });
  return cart ?? null;
}

/**
 * Actualiza el metadata de un line item con el precio ajustado
 */
export async function updateLineItemMetadata(
  transactionalManager: TransactionManager,
  itemId: string,
  adjustedPrice: number
): Promise<boolean> {
  try {
    const repo = transactionalManager.getRepository<LineItemEntity>("LineItem");
    const item = await repo.findOne({ where: { id: itemId } });
    if (!item) return false;

    item.metadata = { ...item.metadata, adjusted_unit_price: adjustedPrice };
    await repo.save(item);
    return true;
  } catch {
    return false;
  }
}

/**
 * Actualiza el data de un shipping method con el precio ajustado
 */
export async function updateShippingMethodData(
  transactionalManager: TransactionManager,
  methodId: string,
  adjustedPrice: number
): Promise<boolean> {
  try {
    const repo =
      transactionalManager.getRepository<ShippingMethodEntity>(
        "ShippingMethod"
      );
    const method = await repo.findOne({ where: { id: methodId } });
    if (!method) return false;

    method.data = { ...method.data, adjusted_price: adjustedPrice };
    await repo.save(method);
    return true;
  } catch {
    return false;
  }
}

/**
 * Actualiza el metadata del carrito con información del territorio
 */
export async function updateCartMetadata(
  transactionalManager: TransactionManager,
  cartId: string,
  territoryType: string,
  pricesAdjusted: boolean
): Promise<boolean> {
  try {
    const cartRepo = transactionalManager.getRepository<CartEntity>("Cart");
    const cart = await cartRepo.findOne({ where: { id: cartId } });
    if (!cart) return false;

    cart.metadata = {
      ...cart.metadata,
      territory_type: territoryType,
      prices_adjusted: pricesAdjusted,
    };
    await cartRepo.save(cart);
    return true;
  } catch {
    return false;
  }
}
