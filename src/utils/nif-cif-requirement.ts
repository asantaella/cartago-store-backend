/**
 * NIF/CIF requirement for high-value EUR carts.
 *
 * Mirrors the storefront rule (cartago-store-frontend
 * `src/modules/checkout/nif-validation.ts`): EUR carts whose total is €400 or
 * more must carry a NIF/CIF on the shipping or billing address metadata.
 *
 * Medusa v1 carts have no `currency_code`; the currency lives on the region.
 */

type NifCifAddress = {
  metadata?: { nif_cif?: unknown } | null;
};

export type NifCifCart = {
  total?: number | null;
  region?: { currency_code?: string | null } | null;
  shipping_address?: NifCifAddress | null;
  billing_address?: NifCifAddress | null;
};

export const EUR_NIF_CIF_THRESHOLD_MINOR_UNITS = 40_000;

export function isNifCifRequiredByCartTotal(
  cart: Pick<NifCifCart, "region" | "total"> | null | undefined
): boolean {
  return (
    cart?.region?.currency_code?.toLowerCase() === "eur" &&
    (cart.total ?? 0) >= EUR_NIF_CIF_THRESHOLD_MINOR_UNITS
  );
}

export function hasNifCif(cart: NifCifCart): boolean {
  return [cart.shipping_address, cart.billing_address].some((address) => {
    const nifCif = address?.metadata?.nif_cif;
    return typeof nifCif === "string" && nifCif.trim().length > 0;
  });
}

export function isNifCifMissingForCart(
  cart: NifCifCart | null | undefined
): boolean {
  return !!cart && isNifCifRequiredByCartTotal(cart) && !hasNifCif(cart);
}
