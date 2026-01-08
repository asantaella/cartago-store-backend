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
  detectTerritoryChange,
  // Transformaciones
  extractCartFromBody,
  transformCartItemsForTaxExempt,
  transformShippingMethodsForTaxExempt,
  recalculateCartTotals,
  applyTaxRate,
  applyTaxExemptTransformations,
  getLineItemAdjustedPrice,
  getShippingMethodAdjustedPrice,
  calculateItemsSubtotal,
  calculateShippingTotal,
  calculateTotalDiscount,
  calculateDiscountFromAdjustments,
  // Persistencia
  persistLineItemMetadataPrices,
  persistShippingMethodDataPrices,
  persistLineItemUnitPrice,
  persistShippingMethodPrice,
  restoreOriginalLineItemPrices,
  restoreOriginalShippingPrices,
  loadCartWithRelations,
  updateLineItemMetadata,
  updateShippingMethodData,
  updateCartMetadata,
  // Logging
  log,
  logError,
  logCartOperation,
  logPriceChange,
  // Error handling
  safeMiddlewareExecution,
  safeJsonTransform,
  // Resolvers
  resolveSpanishTaxService,
  resolveManager,
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
