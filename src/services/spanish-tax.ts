import {
  AbstractTaxService,
  ItemTaxCalculationLine,
  ShippingTaxCalculationLine,
  TaxCalculationContext,
} from "@medusajs/medusa";
import { ProviderTaxLine } from "@medusajs/medusa/dist/types/tax-service";

class SpanishTaxService extends AbstractTaxService {
  static identifier = "spanish-tax";

  constructor(container: any) {
    // console.log("[CanariasTaxService] Initialized");
    super(container);
  }

  // Códigos postales de territorios con exención de IVA
  private taxExemptPostalCodes = [
    // Islas Canarias
    // Las Palmas
    /^35\d{3}$/,
    // Santa Cruz de Tenerife
    /^38\d{3}$/,
    // Ceuta
    /^51\d{3}$/,
    // Melilla
    /^52\d{3}$/,
  ];

  async getTaxLines(
    itemLines: ItemTaxCalculationLine[],
    shippingLines: ShippingTaxCalculationLine[],
    context: TaxCalculationContext
  ): Promise<ProviderTaxLine[]> {
    const taxLines: ProviderTaxLine[] = [];

    const isTaxExempt = this.isTaxExemptAddress(
      context.shipping_address?.postal_code
    );

    const postalCode = context.shipping_address?.postal_code;

    // Productos
    for (const line of itemLines) {
      if (isTaxExempt) {
        // Para zonas de tax 0%: calculamos los valores y los incluimos en metadata
        // pero NO mutamos aquí el precio del item. La corrección de precios
        // se deberá realizar desde el Service que persiste los cambios (OrderService),
        // para evitar aplicar la conversión dos veces.
        const original = line.item.unit_price;
        const priceWithoutTax = this.calculatePriceWithoutTax(original);

        taxLines.push({
          rate: 0,
          name: this.getTaxExemptName(postalCode),
          code: this.getTaxExemptCode(postalCode),
          item_id: line.item.id,
          metadata: {
            original_price: original,
            price_without_tax: priceWithoutTax,
            tax_removed: original - priceWithoutTax,
            territory_type: this.getTerritoryType(postalCode),
          },
        });
      } else {
        const taxAmount = this.calculateIncludedTaxAmount(line.item.unit_price);
        taxLines.push({
          rate: 21,
          name: "IVA 21%",
          code: "ES_IVA_21",
          item_id: line.item.id,
          metadata: {
            tax_included: true,
            tax_amount: taxAmount,
          },
        });
      }
    }

    // Envío
    for (const line of shippingLines) {
      if (isTaxExempt) {
        // Igual que con items: no mutamos el precio del shipping_method aquí,
        // sólo devolvemos metadata útil para quien persista la corrección.
        const original = line.shipping_method.price;
        const priceWithoutTax = this.calculatePriceWithoutTax(original);
        taxLines.push({
          rate: 0,
          name: this.getShippingTaxExemptName(postalCode),
          code: this.getShippingTaxExemptCode(postalCode),
          shipping_method_id: line.shipping_method.id,
          metadata: {
            original_price: original,
            price_without_tax: priceWithoutTax,
            tax_removed: original - priceWithoutTax,
            territory_type: this.getTerritoryType(postalCode),
          },
        });
      } else {
        const shippingTaxAmount = this.calculateIncludedTaxAmount(
          line.shipping_method.price
        );
        taxLines.push({
          rate: 21,
          name: "IVA Envío 21%",
          code: "ES_IVA_SHIPPING_21",
          shipping_method_id: line.shipping_method.id,
          metadata: {
            tax_included: true,
            tax_amount: shippingTaxAmount,
          },
        });
      }
    }

    return taxLines;
  }

  // Alias for backward compatibility and clearer naming
  public isTaxExemptAddress(postalCode?: string): boolean {
    if (!postalCode) return false;

    return this.taxExemptPostalCodes.some((pattern) =>
      pattern.test(postalCode.replace(/\s/g, ""))
    );
  }

  public calculateIncludedTaxAmount(priceWithTax: number): number {
    // IVA incluido = Precio con IVA - (Precio con IVA / 1.21)
    const priceWithoutTax = priceWithTax / 1.21;
    return Math.round(priceWithTax - priceWithoutTax);
  }

  public calculatePriceWithoutTax(priceWithTax: number): number {
    // Precio sin IVA = Precio con IVA / 1.21
    // Note: Medusa works with prices in cents, so we need to handle this properly
    return Math.round(priceWithTax / 1.21);
  }

  // Nota: no mutamos precios en el provider. La extracción del IVA incluido
  // la maneja Medusa cuando prices.includes_tax=true y tax_inclusive_pricing está activo.

  /**
   * Determina el tipo de territorio basado en el código postal
   */
  public getTerritoryType(postalCode?: string): string {
    if (!postalCode) return "standard";

    const cleanPostal = postalCode.replace(/\s/g, "");

    if (/^35\d{3}$/.test(cleanPostal) || /^38\d{3}$/.test(cleanPostal)) {
      return "canarias";
    }
    if (/^51\d{3}$/.test(cleanPostal)) {
      return "ceuta";
    }
    if (/^52\d{3}$/.test(cleanPostal)) {
      return "melilla";
    }

    return "standard";
  }

  /**
   * Obtiene el nombre del impuesto para territorios exentos
   */
  public getTaxExemptName(postalCode?: string): string {
    const territoryType = this.getTerritoryType(postalCode);

    switch (territoryType) {
      case "canarias":
        return "Exento IVA - Canarias";
      case "ceuta":
        return "Exento IVA - Ceuta";
      case "melilla":
        return "Exento IVA - Melilla";
      default:
        return "Exento IVA";
    }
  }

  /**
   * Obtiene el código del impuesto para territorios exentos
   */
  public getTaxExemptCode(postalCode?: string): string {
    const territoryType = this.getTerritoryType(postalCode);

    switch (territoryType) {
      case "canarias":
        return "CANARIAS_EXEMPT";
      case "ceuta":
        return "CEUTA_EXEMPT";
      case "melilla":
        return "MELILLA_EXEMPT";
      default:
        return "TAX_EXEMPT";
    }
  }

  /**
   * Obtiene el nombre del impuesto de envío para territorios exentos
   */
  public getShippingTaxExemptName(postalCode?: string): string {
    const territoryType = this.getTerritoryType(postalCode);

    switch (territoryType) {
      case "canarias":
        return "Envío Exento - Canarias";
      case "ceuta":
        return "Envío Exento - Ceuta";
      case "melilla":
        return "Envío Exento - Melilla";
      default:
        return "Envío Exento";
    }
  }

  /**
   * Obtiene el código del impuesto de envío para territorios exentos
   */
  public getShippingTaxExemptCode(postalCode?: string): string {
    const territoryType = this.getTerritoryType(postalCode);

    switch (territoryType) {
      case "canarias":
        return "CANARIAS_SHIPPING_EXEMPT";
      case "ceuta":
        return "CEUTA_SHIPPING_EXEMPT";
      case "melilla":
        return "MELILLA_SHIPPING_EXEMPT";
      default:
        return "SHIPPING_EXEMPT";
    }
  }
}
export default SpanishTaxService;
