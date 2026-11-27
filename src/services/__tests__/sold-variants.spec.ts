import SoldVariantsService from "../sold-variants";

const buildService = (query: jest.Mock) =>
  new SoldVariantsService({ manager: { query } } as any);

describe("SoldVariantsService.listByDate", () => {
  it("queries completed orders of the Madrid day, most recent sale first", async () => {
    const query = jest.fn().mockResolvedValue([]);

    await buildService(query).listByDate("2026-11-27");

    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual(["2026-11-27"]);
    expect(sql).toContain("o.status = 'completed'");
    expect(sql).toContain("AT TIME ZONE 'Europe/Madrid'");
    expect(sql).toContain("ORDER BY o.created_at DESC");
  });

  it("returns one typed row per line item, with numeric quantity and display_id", async () => {
    const soldAt = new Date("2026-11-27T09:30:00Z");
    const query = jest.fn().mockResolvedValue([
      {
        line_item_id: "li_1",
        quantity: "2",
        variant_id: "variant_1",
        variant_title: "Red / L",
        barcode: "8400000000001",
        product_id: "prod_1",
        product_title: "Bumper",
        thumbnail: null,
        order_id: "order_1",
        display_id: "1042",
        sold_at: soldAt,
      },
    ]);

    const rows = await buildService(query).listByDate("2026-11-27");

    expect(rows).toEqual([
      expect.objectContaining({
        line_item_id: "li_1",
        quantity: 2,
        order_id: "order_1",
        display_id: 1042,
        sold_at: soldAt,
      }),
    ]);
  });
});
