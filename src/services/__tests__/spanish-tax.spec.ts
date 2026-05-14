import SpanishTaxService from "../spanish-tax";

describe("SpanishTaxService", () => {
  const service = new SpanishTaxService({} as never);

  it("classifies Spanish territories only for ES addresses", () => {
    expect(service.getTerritoryType("ES", "35001")).toBe("canarias");
    expect(service.getTerritoryType("es", "38001")).toBe("canarias");
    expect(service.getTerritoryType("ES", "51001")).toBe("ceuta");
    expect(service.getTerritoryType("ES", "52001")).toBe("melilla");
    expect(service.getTerritoryType("FR", "35001")).toBe("standard");
    expect(service.getTerritoryType("", "35001")).toBe("standard");
  });

  it("keeps tax-exempt detection country-aware", () => {
    expect(service.isTaxExemptAddress("ES", "35001")).toBe(true);
    expect(service.isTaxExemptAddress("FR", "35001")).toBe(false);
    expect(service.isTaxExemptAddress("35001")).toBe(true);
  });

  it("returns standard tax lines for non-ES shipping addresses", async () => {
    const taxLines = await service.getTaxLines(
      [
        {
          item: {
            id: "item_1",
            unit_price: 121,
          },
        } as any,
      ],
      [
        {
          shipping_method: {
            id: "ship_1",
            price: 121,
          },
        } as any,
      ],
      {
        shipping_address: {
          country_code: "FR",
          postal_code: "35001",
        },
      } as any,
    );

    expect(taxLines).toHaveLength(2);
    expect(taxLines.every((line) => line.rate === 21)).toBe(true);
    expect(taxLines[0]?.name).toBe("IVA 21%");
    expect(taxLines[1]?.name).toBe("IVA Envío 21%");
  });
});