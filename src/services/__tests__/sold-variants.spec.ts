import SoldVariantsService from "../sold-variants";

const buildService = (query: jest.Mock) =>
  new SoldVariantsService({ manager: { query } } as any);

describe("SoldVariantsService.listByDate", () => {
  it("queries orders of the Madrid day that are captured or shipped, most recent sale first, one page at a time", async () => {
    const query = jest.fn().mockResolvedValue([]);

    await buildService(query).listByDate("2026-11-27", { limit: 20, offset: 40 });

    const [listSql, listParams] = query.mock.calls[0];
    expect(listParams).toEqual(["2026-11-27", 20, 40]);
    expect(listSql).toContain(
      "(o.payment_status = 'captured' OR o.fulfillment_status = 'shipped')",
    );
    expect(listSql).not.toContain("o.status = 'completed'");
    expect(listSql).not.toContain("deleted_at");
    expect(listSql).toContain("AT TIME ZONE 'Europe/Madrid'");
    expect(listSql).toContain("ORDER BY o.created_at DESC");
    expect(listSql).toContain("LIMIT $2 OFFSET $3");
  });

  it("returns one typed row per line item, with numeric quantity and display_id", async () => {
    const soldAt = new Date("2026-11-27T09:30:00Z");
    const query = jest
      .fn()
      .mockResolvedValueOnce([
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
          fulfillment_status: "shipped",
          sold_at: soldAt,
        },
      ])
      .mockResolvedValueOnce([]);

    const { sold } = await buildService(query).listByDate("2026-11-27", {
      limit: 20,
      offset: 0,
    });

    expect(sold).toEqual([
      expect.objectContaining({
        line_item_id: "li_1",
        quantity: 2,
        order_id: "order_1",
        display_id: 1042,
        fulfillment_status: "shipped",
        sold_at: soldAt,
      }),
    ]);
  });

  it("summarizes the whole day: line count, units and amount per currency", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { currency_code: "eur", lines: "3", units: "5", amount: "12345" },
      ]);

    const { summary } = await buildService(query).listByDate("2026-11-27", {
      limit: 20,
      offset: 0,
    });

    const [summarySql, summaryParams] = query.mock.calls[1];
    expect(summaryParams).toEqual(["2026-11-27"]);
    expect(summarySql).toContain("GROUP BY o.currency_code");
    expect(summary).toEqual({
      count: 3,
      units: 5,
      amounts: [{ currency_code: "eur", amount: 12345 }],
    });
  });
});
