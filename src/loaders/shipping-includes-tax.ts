import { MedusaContainer, ShippingOptionService } from "@medusajs/medusa";

/**
 * Ensure shipping options are marked as tax-inclusive when your store prices
 * shipping with VAT included. This avoids mismatched subtotals in zero-tax zones.
 */
export default async (container: MedusaContainer): Promise<void> => {
  const shippingOptionService = container.resolve<ShippingOptionService>(
    "shippingOptionService"
  );

  try {
    console
    const options = await shippingOptionService.list({}, {});
    for (const opt of options as any[]) {
      if ((opt as any).includes_tax !== true) {
        await shippingOptionService.update(opt.id, {
          includes_tax: true,
        } as any);
        console.log(`[TAX] Marked shipping option ${opt.id} includes_tax=true`);
      }
    }
  } catch (e) {
    console.warn("[TAX] Could not normalize shipping includes_tax:", e);
  }
};
