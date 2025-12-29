// Helper para calcular precio sin IVA (trabaja con centavos - integers)
// Recibe precio en centavos (ej: 1000 = 10.00€) y devuelve precio sin IVA en centavos
export function calculatePriceWithoutTax(priceInCents: number): number {
  return priceInCents / 1.21;
}

// Helper para calcular impuestos del IVA 21% (trabaja con centavos)
export function calculateTaxAmount(priceInCents: number): number {
  return priceInCents * 0.21;
}
