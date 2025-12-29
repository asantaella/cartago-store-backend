// Helper para calcular precio sin IVA (trabaja con centavos - integers)
// Recibe precio en centavos (ej: 1000 = 10.00€) y devuelve precio sin IVA en centavos
export function calculatePriceWithoutTax(priceInCents: number): number {
  return priceInCents / 1.21;
}

// Helper para calcular impuestos del IVA 21% (trabaja con centavos)
export function calculateTaxAmount(priceInCents: number): number {
  return priceInCents * 0.21;
}

/**
 * Calcula el descuento ajustado para un precio base (sin IVA)
 * Cuando el precio se reduce quitando impuestos, el descuento también se debe reducir
 * proporcionalmente para mantener la coherencia.
 *
 * Ejemplo:
 * - Precio con IVA: 1000 cents (10€) con descuento 100 cents (1€)
 * - Precio sin IVA: ~826.45 cents
 * - Descuento ajustado: ~82.64 cents (proporcionalmente reducido)
 *
 * @param discountInCents Descuento en centavos sobre el precio CON IVA
 * @returns Descuento proporcionalmente ajustado para precio SIN IVA
 */
export function adjustDiscountForTaxExempt(discountInCents: number): number {
  // El descuento se reduce en la misma proporción que el precio (dividido entre 1.21)
  return discountInCents / 1.21;
}
