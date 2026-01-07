/**
 * Este archivo mantiene las exportaciones por compatibilidad.
 * Las implementaciones se han movido a archivos separados.
 */

export { adjustCartPricingOnGet } from "./cart-pricing-on-get";
export { adjustCartPricingOnPost } from "./cart-pricing-on-post";
export { persistCartPricingOnComplete } from "./cart-pricing-on-complete";
export {
  // Funciones de cálculo de precios
  calculatePriceWithoutTax,
  calculateTaxAmount,
  adjustDiscountForTaxExempt,
  getAdjustedPrice,
  calculateAdjustedDiscount,
  // Validaciones
  isValidPrice,
  pricesAreDifferent,
  getTaxContext,
  // Transformaciones
  getLineItemAdjustedPrice,
  getShippingMethodAdjustedPrice,
  calculateItemsSubtotal,
  calculateShippingTotal,
  calculateTotalDiscount,
  calculateDiscountFromAdjustments,
  // Logging
  log,
  logError,
  logCartOperation,
  logPriceChange,
  // Error handling
  safeMiddlewareExecution,
  safeJsonTransform,
  // Tipos
  type CartEntity,
  type LineItemEntity,
  type LineItemAdjustmentEntity,
  type ShippingMethodEntity,
  type PaymentSessionEntity,
  type TaxContext,
  type Manager,
  type TransactionManager,
  type Repository,
} from "./cart-pricing-helpers";
