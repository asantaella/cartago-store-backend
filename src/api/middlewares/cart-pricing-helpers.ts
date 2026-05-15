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
  metadata?: Record<string, unknown> & {
    adjusted_unit_price?: number;
    original_discount_total?: number;
    original_unit_price?: number;
  };
  subtotal?: number;
  adjustments?: Array<{ description?: string; amount?: number }>;
  variant?: {
    shipping_option_price_extra?: number;
  } | null;
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
  includes_tax?: boolean;
  subtotal?: number;
  total?: number;
  tax_total?: number;
  data?: Record<string, unknown> & {
    adjusted_price?: number;
    original_price?: number;
    shipping_extra_total?: number;
  };
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
  shipping_address?: { postal_code?: string; country_code?: string };
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
  item_tax_total?: number;
  shipping_tax_total?: number;
  tax_total?: number;
  tax_rate?: number;
  discount_total?: number;
  gift_card_total?: number;
  gift_card_tax_total?: number;
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
    fn: (transactionalManager: TransactionManager) => Promise<T>,
  ) => Promise<T>;
  getRepository: <T>(name: string) => Repository<T>;
};

export interface TaxContext {
  countryCode: string;
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
  adjustedPrice: number,
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
  tolerance = 1,
): boolean {
  return Math.abs(price1 - price2) > tolerance;
}

/**
 * Extrae el contexto fiscal de un carrito basado en su código postal
 */
export function getTaxContext(
  cart: CartEntity,
  spanishTaxService: SpanishTaxService,
): TaxContext | null {
  const countryCode = cart.shipping_address?.country_code ?? "";
  const postalCode = cart.shipping_address?.postal_code;
  if (!postalCode) return null;

  const territoryType = spanishTaxService.getTerritoryType(
    countryCode,
    postalCode,
  );

  return {
    countryCode,
    postalCode,
    isTaxExempt: spanishTaxService.isTaxExemptAddress(countryCode, postalCode),
    territoryType,
  };
}

/**
 * Resuelve el servicio de impuestos españoles desde el scope de la request
 */
export function resolveSpanishTaxService(
  req: MedusaRequest,
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
  method: ShippingMethodEntity,
): number {
  const dataPrice = method.data?.adjusted_price;
  const shippingExtraTotal = method.data?.shipping_extra_total;
  const currentPrice = method.price;

  if (isValidPrice(dataPrice)) {
    const adjustedPrice = Math.round(
      dataPrice + (isValidPrice(shippingExtraTotal) ? shippingExtraTotal : 0),
    );

    const discountedSubtotal = method.subtotal;

    if (
      isValidPrice(discountedSubtotal) &&
      discountedSubtotal < adjustedPrice
    ) {
      return discountedSubtotal;
    }

    // If a shipping discount already lowered the persisted method price,
    // keep that discounted amount instead of restoring the base adjusted price.
    if (isValidPrice(currentPrice) && currentPrice < adjustedPrice) {
      return currentPrice;
    }

    return adjustedPrice;
  }

  return getAdjustedPrice(method.price);
}

/**
 * Calcula el subtotal de todos los items (precio ajustado × cantidad)
 */
export function calculateItemsSubtotal(
  items: LineItemEntity[],
  useAdjustedPrices: boolean,
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
  useAdjustedPrices: boolean,
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

function getOriginalItemDiscountTotal(item: LineItemEntity): number {
  const metadataDiscount = item.metadata?.original_discount_total;

  if (isValidPrice(metadataDiscount)) {
    return metadataDiscount;
  }

  return (
    calculateDiscountFromAdjustments(item.adjustments) ||
    item.discount_total ||
    0
  );
}

function calculateOriginalItemsDiscountTotal(items: LineItemEntity[]): number {
  if (!Array.isArray(items)) return 0;

  return items.reduce(
    (sum, item) => sum + getOriginalItemDiscountTotal(item),
    0,
  );
}

function calculateAdjustedShippingDiscountTotal(
  cart: CartEntity,
  adjustedShippingTotal: number,
): number {
  const originalCartDiscountTotal = cart.discount_total || 0;

  if (originalCartDiscountTotal <= 0 || adjustedShippingTotal <= 0) {
    return 0;
  }

  const originalItemsDiscountTotal = calculateOriginalItemsDiscountTotal(
    cart.items || [],
  );
  const originalShippingDiscountTotal = Math.max(
    0,
    originalCartDiscountTotal - originalItemsDiscountTotal,
  );

  if (originalShippingDiscountTotal <= 0) {
    return 0;
  }

  const currentShippingTotal = Math.max(
    cart.shipping_total || 0,
    calculateShippingTotal(cart.shipping_methods || [], false),
  );

  if (currentShippingTotal <= 0) {
    return Math.min(originalShippingDiscountTotal, adjustedShippingTotal);
  }

  return Math.min(
    adjustedShippingTotal,
    Math.round(
      originalShippingDiscountTotal *
        (adjustedShippingTotal / currentShippingTotal),
    ),
  );
}

export function hasStaleStandardPricing(cart: CartEntity): boolean {
  const hasAdjustedItems = (cart.items || []).some((item) => {
    const originalPrice = item.metadata?.original_unit_price;
    const adjustedPrice = item.metadata?.adjusted_unit_price;

    return (
      isValidPrice(originalPrice) &&
      isValidPrice(adjustedPrice) &&
      item.unit_price !== originalPrice
    );
  });

  const territoryType = cart.metadata?.territory_type;
  const hasStaleTerritory =
    typeof territoryType === "string" && territoryType !== "standard";

  return hasAdjustedItems || hasStaleTerritory;
}

export function applyStandardPricingRestoration(
  cart: CartEntity,
  taxContext: TaxContext,
): void {
  const taxRate = cart.region?.tax_rate ?? cart.tax_rate ?? 0;
  const giftCardTaxTotal = cart.gift_card_tax_total || 0;
  const previousItemDiscountTotal = calculateTotalDiscount(cart.items || []);
  const originalItemsDiscountTotal = calculateOriginalItemsDiscountTotal(
    cart.items || [],
  );
  const shippingDiscountTotal = Math.max(
    0,
    (cart.discount_total || 0) - previousItemDiscountTotal,
  );

  let correctedSubtotal = 0;
  let correctedItemTaxTotal = 0;
  let correctedShippingSubtotal = 0;
  let correctedShippingTaxTotal = 0;

  for (const item of cart.items || []) {
    const originalPrice = item.metadata?.original_unit_price;
    const quantity = item.quantity || 1;
    const restoredUnitPrice = isValidPrice(originalPrice)
      ? Math.round(originalPrice)
      : item.unit_price;
    const restoredDiscountTotal = getOriginalItemDiscountTotal(item);
    const grossSubtotal = restoredUnitPrice * quantity;
    const netSubtotal =
      taxRate > 0
        ? Math.round(grossSubtotal / (1 + taxRate / 100))
        : grossSubtotal;

    item.unit_price = restoredUnitPrice;
    item.discount_total = restoredDiscountTotal;
    item.subtotal = netSubtotal;

    correctedSubtotal += netSubtotal;
    correctedItemTaxTotal += grossSubtotal - netSubtotal;
  }

  for (const method of cart.shipping_methods || []) {
    const methodSubtotal = method.subtotal ?? method.price ?? 0;
    const methodTotal = method.total ?? method.price ?? 0;
    const methodTaxTotal =
      method.tax_total ?? Math.max(0, methodTotal - methodSubtotal);

    correctedShippingSubtotal += methodSubtotal;
    correctedShippingTaxTotal += methodTaxTotal;
  }

  cart.subtotal = correctedSubtotal;
  cart.shipping_total = correctedShippingSubtotal;
  cart.item_tax_total = correctedItemTaxTotal;
  cart.shipping_tax_total = correctedShippingTaxTotal;
  cart.discount_total = originalItemsDiscountTotal + shippingDiscountTotal;
  cart.tax_total =
    correctedItemTaxTotal + correctedShippingTaxTotal - giftCardTaxTotal;
  cart.total =
    correctedSubtotal +
    correctedShippingSubtotal +
    (cart.tax_total || 0) -
    (cart.discount_total || 0) -
    (cart.gift_card_total || 0);

  if (Array.isArray(cart.payment_sessions)) {
    for (const session of cart.payment_sessions) {
      session.amount = cart.total || 0;
    }
  }

  cart.metadata = {
    ...cart.metadata,
    territory_type: taxContext.territoryType,
  };
}

/**
 * Calcula el descuento de un item desde sus adjustments
 * En Medusa, los descuentos se almacenan en adjustments con description: "discount"
 */
export function calculateDiscountFromAdjustments(
  adjustments?: Array<{ description?: string; amount?: number }>,
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
  transactions?: GiftCardTransaction[],
): number {
  if (!Array.isArray(transactions)) return 0;
  return transactions.reduce(
    (sum, transaction) => sum + (transaction.amount || 0),
    0,
  );
}

/**
 * Ajusta el gift_card_total para una región tax-exempt
 */

// ============================================================================
// TRANSFORMACIONES DE CART
// ============================================================================

/**
 * Extrae el carrito de la respuesta, soportando múltiples formatos
 */
export function extractCartFromBody(body: unknown): {
  cart: CartEntity | null;
  isDraftOrder: boolean;
} {
  if (!body || typeof body !== "object") {
    return { cart: null, isDraftOrder: false };
  }

  const bodyObj = body as Record<string, unknown>;

  if (bodyObj.cart) {
    return { cart: bodyObj.cart as CartEntity, isDraftOrder: false };
  }

  if (
    bodyObj.draft_order &&
    typeof bodyObj.draft_order === "object" &&
    (bodyObj.draft_order as Record<string, unknown>).cart
  ) {
    return {
      cart: (bodyObj.draft_order as Record<string, unknown>).cart as CartEntity,
      isDraftOrder: true,
    };
  }

  return { cart: null, isDraftOrder: false };
}

/**
 * Transforma los items del carrito para zonas tax-exempt
 */
export function transformCartItemsForTaxExempt(cart: CartEntity): void {
  if (!Array.isArray(cart.items)) return;

  for (const item of cart.items) {
    if (!isValidPrice(item.unit_price)) continue;

    const originalPrice = item.unit_price;
    const basePrice = getLineItemAdjustedPrice(item);

    // Obtener el descuento original desde metadata si existe
    const originalDiscountFromMetadata = item.metadata
      ?.original_discount_total as number | undefined;
    const currentDiscount = item.discount_total || 0;

    const originalDiscount =
      originalDiscountFromMetadata !== undefined
        ? originalDiscountFromMetadata
        : currentDiscount;

    // Calcular el descuento ajustado proporcionalmente
    const priceRatio = basePrice / originalPrice;
    const adjustedDiscount =
      originalDiscount > 0 ? Math.round(originalDiscount * priceRatio) : 0;

    item.subtotal = basePrice * (item.quantity || 1);
    item.discount_total = adjustedDiscount;

    // Guardar el descuento original en metadata
    if (!item.metadata) {
      item.metadata = {};
    }
    if (originalDiscountFromMetadata === undefined && currentDiscount > 0) {
      (item.metadata as any).original_discount_total = currentDiscount;
    }

    log(
      `Transform item ${item.id} - basePrice: ${Math.round(
        basePrice,
      )} cents, ` +
        `discount: ${adjustedDiscount} cents (original: ${originalDiscount}), ` +
        `subtotal: ${Math.round(item.subtotal)} cents`,
    );
  }
}

/**
 * Transforma los shipping methods del carrito para zonas tax-exempt
 */
export function transformShippingMethodsForTaxExempt(cart: CartEntity): void {
  if (!Array.isArray(cart.shipping_methods)) return;

  for (const method of cart.shipping_methods) {
    if (!isValidPrice(method.price)) continue;

    const baseShippingPrice = getShippingMethodAdjustedPrice(method);
    (method as Record<string, unknown>)["price_without_tax"] =
      baseShippingPrice;

    log(
      `Transform shipping ${method.id} - baseShippingPrice: ${Math.round(
        baseShippingPrice,
      )} cents`,
    );
  }
}

/**
 * Recalcula los totales del carrito para zonas tax-exempt
 */
export function recalculateCartTotals(cart: CartEntity): void {
  cart.subtotal =
    cart.items?.reduce((sum, item) => sum + (item.subtotal || 0), 0) || 0;

  const adjustedShippingTotal = calculateShippingTotal(
    cart.shipping_methods || [],
    true,
  );
  const adjustedItemsDiscountTotal = calculateTotalDiscount(cart.items || []);
  const adjustedShippingDiscountTotal = calculateAdjustedShippingDiscountTotal(
    cart,
    adjustedShippingTotal,
  );

  cart.shipping_total = adjustedShippingTotal;

  cart.tax_total = 0;
  cart.discount_total =
    adjustedItemsDiscountTotal + adjustedShippingDiscountTotal;

  cart.total =
    cart.subtotal +
    adjustedShippingTotal -
    cart.discount_total -
    (cart.gift_card_total || 0);
}

/**
 * Aplica tax rate 0% para zonas tax-exempt
 */
export function applyTaxRate(cart: CartEntity): void {
  const originalTaxRate = cart.region?.tax_rate;

  if (!cart.region) {
    cart.region = {};
  }

  cart.region.tax_rate = 0;

  log(
    `Applied tax_rate 0% to region of cart ${cart.id} (original: ${
      originalTaxRate ?? "undefined"
    })`,
  );
}

/**
 * Aplica todas las transformaciones de precio para zona tax-exempt
 */
export function applyTaxExemptTransformations(
  cart: CartEntity,
  taxContext: TaxContext,
): void {
  transformCartItemsForTaxExempt(cart);
  transformShippingMethodsForTaxExempt(cart);
  recalculateCartTotals(cart);
  applyTaxRate(cart);

  cart.metadata = {
    ...cart.metadata,
    territory_type: taxContext.territoryType,
  };
}

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
  details: Record<string, unknown>,
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
  adjustedPrice: number,
): void {
  log(
    `${entityType} ${entityId}: ${originalPrice} cents (${(
      originalPrice / 100
    ).toFixed(2)}€) → ${adjustedPrice} cents (${(adjustedPrice / 100).toFixed(
      2,
    )}€)`,
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
  continueOnError = true,
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
  operationName: string,
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
    "items.variant",
    "shipping_methods",
    "shipping_address",
    "region",
  ],
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
  adjustedPrice: number,
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
  adjustedPrice: number,
): Promise<boolean> {
  try {
    const repo =
      transactionalManager.getRepository<ShippingMethodEntity>(
        "ShippingMethod",
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
  pricesAdjusted: boolean,
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

/**
 * Detecta si ha habido un cambio de zona fiscal (standard <-> tax-exempt)
 */
export function detectTerritoryChange(
  currentCart: CartEntity,
  newTaxContext: TaxContext,
): { hasChanged: boolean; previouslyTaxExempt: boolean } {
  const previousTerritoryType = currentCart.metadata?.territory_type as
    | string
    | undefined;
  const currentTerritoryType = newTaxContext.territoryType;

  // Si no hay territorio previo, no hay cambio
  if (!previousTerritoryType) {
    return { hasChanged: false, previouslyTaxExempt: false };
  }

  // Determinar si el territorio previo era tax-exempt
  // Asumimos que cualquier territorio que no sea "PENINSULA" es tax-exempt
  const previouslyTaxExempt = previousTerritoryType !== "standard";
  const currentlyTaxExempt = newTaxContext.isTaxExempt;

  // Ha habido cambio si el estado tax-exempt ha cambiado
  const hasChanged = previouslyTaxExempt !== currentlyTaxExempt;

  if (hasChanged) {
    log(
      `Territory change detected for cart ${currentCart.id}: ` +
        `${previousTerritoryType} (exempt: ${previouslyTaxExempt}) -> ` +
        `${currentTerritoryType} (exempt: ${currentlyTaxExempt})`,
    );
  }

  return { hasChanged, previouslyTaxExempt };
}

/**
 * Restaura los precios originales de los line items cuando se vuelve a zona standard
 */
export async function restoreOriginalLineItemPrices(
  transactionalManager: TransactionManager,
  items: LineItemEntity[],
): Promise<number> {
  let restoredCount = 0;

  for (const item of items) {
    if (!item.metadata) continue;

    const originalPrice = item.metadata.original_unit_price as
      | number
      | undefined;
    const originalDiscount = item.metadata.original_discount_total as
      | number
      | undefined;

    // Si hay precio original guardado y es diferente del actual, restaurar
    if (originalPrice !== undefined && item.unit_price !== originalPrice) {
      log(
        `Restoring original price for item ${item.id}: ${item.unit_price} -> ${originalPrice} cents`,
      );

      item.unit_price = originalPrice;

      // Restaurar descuento original si existe
      if (originalDiscount !== undefined) {
        item.discount_total = originalDiscount;
        log(
          `Restoring original discount for item ${item.id}: ${item.discount_total} -> ${originalDiscount} cents`,
        );
      }

      // Limpiar metadata de ajustes
      delete item.metadata.adjusted_unit_price;
      delete item.metadata.original_discount_total;
      delete item.metadata.original_unit_price;

      const repo =
        transactionalManager.getRepository<LineItemEntity>("LineItem");
      await repo.save(item);
      restoredCount++;
    }
  }

  return restoredCount;
}

/**
 * Restaura los precios originales de los shipping methods cuando se vuelve a zona standard
 */
export async function restoreOriginalShippingPrices(
  transactionalManager: TransactionManager,
  methods: ShippingMethodEntity[],
): Promise<number> {
  let restoredCount = 0;

  for (const method of methods) {
    if (!method.data) continue;

    const originalPrice = method.data.original_price as number | undefined;

    // Si hay precio original guardado y es diferente del actual, restaurar
    if (originalPrice !== undefined && method.price !== originalPrice) {
      log(
        `Restoring original shipping price for method ${method.id}: ${method.price} -> ${originalPrice} cents`,
      );

      method.price = originalPrice;

      // Limpiar data de ajustes
      delete method.data.adjusted_price;
      delete method.data.original_price;

      const repo =
        transactionalManager.getRepository<ShippingMethodEntity>(
          "ShippingMethod",
        );
      await repo.save(method);
      restoredCount++;
    }
  }

  return restoredCount;
}
/**
 * Persiste los precios ajustados en metadata para line items
 */
export async function persistLineItemMetadataPrices(
  transactionalManager: TransactionManager,
  items: LineItemEntity[],
): Promise<number> {
  let updatedCount = 0;

  for (const item of items) {
    if (!isValidPrice(item.unit_price)) continue;

    if (!item.metadata) {
      item.metadata = {};
    }

    // Guardar precio original si no existe aún (primera vez)
    if (item.metadata.original_unit_price === undefined) {
      item.metadata.original_unit_price = item.unit_price;
      log(`Item ${item.id} stored original price: ${item.unit_price} cents`);
    }

    const basePrice = item.metadata.original_unit_price as number;

    // Calcular precio ajustado desde el original con IVA
    const adjustedPrice = getAdjustedPrice(basePrice);
    item.metadata.adjusted_unit_price = adjustedPrice;

    // Guardar descuento original si existe y no está guardado
    const originalDiscount = item.discount_total || 0;
    if (
      originalDiscount > 0 &&
      item.metadata.original_discount_total === undefined
    ) {
      item.metadata.original_discount_total = originalDiscount;
    }

    const repo = transactionalManager.getRepository<LineItemEntity>("LineItem");
    await repo.save(item);

    updatedCount++;
    log(
      `Persisted metadata for item ${item.id} - original_unit_price: ${basePrice} cents, ` +
        `adjusted_unit_price: ${adjustedPrice} cents, original_discount: ${originalDiscount} cents`,
    );
  }

  return updatedCount;
}

/**
 * Persiste los precios ajustados en data para shipping methods
 */
export async function persistShippingMethodDataPrices(
  transactionalManager: TransactionManager,
  methods: ShippingMethodEntity[],
): Promise<number> {
  let updatedCount = 0;

  for (const method of methods) {
    if (!isValidPrice(method.price)) continue;

    if (!method.data) {
      method.data = {};
    }

    if (!method.data) {
      method.data = {};
    }

    // Guardar precio original si no existe aún (primera vez)
    if (method.data.original_price === undefined) {
      method.data.original_price = method.price;
      log(`Shipping ${method.id} stored original price: ${method.price} cents`);
    }

    const basePrice = method.data.original_price as number;

    // Calcular precio ajustado desde el original con IVA
    const adjustedPrice = getAdjustedPrice(basePrice);
    method.data.adjusted_price = adjustedPrice;

    const repo =
      transactionalManager.getRepository<ShippingMethodEntity>(
        "ShippingMethod",
      );
    await repo.save(method);

    updatedCount++;
    log(
      `Persisted data for shipping ${method.id} - original_price: ${basePrice} cents, ` +
        `adjusted_price: ${adjustedPrice} cents`,
    );
  }

  return updatedCount;
}

/**
 * Persiste el precio ajustado directamente en unit_price del line item
 * y recalcula el descuento proporcionalmente
 */
export async function persistLineItemUnitPrice(
  lineItemRepo: { save: (item: LineItemEntity) => Promise<LineItemEntity> },
  adjustmentRepo: any,
  item: LineItemEntity,
  adjustedPrice: number,
): Promise<boolean> {
  const originalPrice = item.unit_price;

  if (!pricesAreDifferent(originalPrice, adjustedPrice)) {
    return false;
  }

  // Obtener el descuento original desde adjustments o discount_total
  const discountFromAdjustments = calculateDiscountFromAdjustments(
    (item as any).adjustments,
  );
  const originalDiscount =
    discountFromAdjustments > 0
      ? discountFromAdjustments
      : item.discount_total || 0;

  // Recalcular descuento proporcionalmente
  const adjustedDiscount = calculateAdjustedDiscount(
    originalDiscount,
    originalPrice,
    adjustedPrice,
  );

  log(
    `Persist unit_price for item ${item.id} - originalPrice: ${originalPrice}, ` +
      `adjustedPrice: ${adjustedPrice}, originalDiscount: ${originalDiscount}, ` +
      `adjustedDiscount: ${adjustedDiscount}`,
  );

  item.unit_price = adjustedPrice;
  item.discount_total = adjustedDiscount;
  await lineItemRepo.save(item);

  // Actualizar los adjustments de descuento
  if (Array.isArray((item as any).adjustments)) {
    for (const adj of (item as any).adjustments) {
      if (adj && adj.description === "discount") {
        const sign = adj.amount >= 0 ? 1 : -1;
        adj.amount = sign * Math.abs(adjustedDiscount);
        await adjustmentRepo.save(adj);
        log(
          `Updated adjustment ${adj.id} for item ${item.id}: ${originalDiscount} → ${adj.amount} cents`,
        );
      }
    }
  }

  logPriceChange("Persisted item", item.id, originalPrice, adjustedPrice);
  log(
    `Persisted discount for item ${item.id}: ${originalDiscount} → ${adjustedDiscount} cents`,
  );

  return true;
}

/**
 * Persiste el precio ajustado directamente en price del shipping method
 */
export async function persistShippingMethodPrice(
  shippingMethodRepo: {
    save: (method: ShippingMethodEntity) => Promise<ShippingMethodEntity>;
  },
  method: ShippingMethodEntity,
  adjustedPrice: number,
): Promise<boolean> {
  const originalPrice = method.price;

  if (!pricesAreDifferent(originalPrice, adjustedPrice)) {
    return false;
  }

  method.price = adjustedPrice;
  await shippingMethodRepo.save(method);

  logPriceChange("Persisted shipping", method.id, originalPrice, adjustedPrice);
  return true;
}

// ============================================================================
// SHIPPING EXTRA POR VARIANTE
// ============================================================================

/**
 * Calcula el recargo total de envío aportado por las variantes del carrito.
 * Regla: extra_total = SUM(variant.shipping_option_price_extra * item.quantity)
 *
 * Requiere que los items se hayan cargado con la relación "items.variant".
 */
export function calculateShippingExtra(cart: CartEntity): number {
  if (!Array.isArray(cart.items) || cart.items.length === 0) return 0;

  return cart.items.reduce((sum, item) => {
    const extra = (item.variant as any)?.shipping_option_price_extra ?? 0;
    if (typeof extra !== "number" || extra <= 0) return sum;
    return sum + extra * (item.quantity || 1);
  }, 0);
}
