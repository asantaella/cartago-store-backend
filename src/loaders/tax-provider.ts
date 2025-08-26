import { MedusaContainer, RegionService } from "@medusajs/medusa";

/**
 * Ensures the ES region uses our custom tax provider.
 * This makes cart and order use the same tax lines provider consistently.
 */
export default async (container: MedusaContainer): Promise<void> => {
  const regionService = container.resolve<RegionService>("regionService");

  try {
    console
    const regions = await regionService.list({}, { relations: ["countries"] });

    for (const region of regions) {
      const hasES = (region.countries || []).some((c: any) => c.iso_2 === "es");
      if (!hasES) continue;

      if (region.tax_provider_id !== "spanish-tax") {
        await regionService.update(region.id, {
          tax_provider_id: "spanish-tax",
        });
        console.log(
          `[TAX] Set Spanish Tax provider for region ${region.name} (${region.id})`
        );
      }
    }
  } catch (e) {
    console.warn("[TAX] Could not set Canarias tax provider automatically:", e);
  }
};
