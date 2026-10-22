import { GET } from "./route";

const makeResponse = () =>
  ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  }) as any;

const variantRow = {
  id: "variant_1",
  title: "Large",
  sku: "SKU-1",
  barcode: "8410000000017",
  inventory_quantity: 3,
  stock_location_code: "A1",
  product: { id: "prod_1", title: "Jacket" },
  prices: [
    { id: "ma_1", currency_code: "eur", amount: 1000, price_list_id: null },
  ],
};

const makeRequest = (query: Record<string, unknown>) => {
  const manager = {
    query: jest.fn(async (sql: string) =>
      /COUNT\(/i.test(sql) ? [{ count: "42" }] : [variantRow],
    ),
  };

  return {
    req: {
      query,
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === "manager") return manager;

          throw new Error(`Unexpected dependency: ${name}`);
        }),
      },
    } as any,
    manager,
  };
};

const dataCall = (manager: { query: jest.Mock }) =>
  manager.query.mock.calls.find(([sql]) => !/COUNT\(/i.test(sql)) as [
    string,
    unknown[],
  ];

describe("GET /admin/cartago/variants", () => {
  it("orders by inventory_quantity ascending by default with a stable tiebreaker", async () => {
    const { req, manager } = makeRequest({});
    const res = makeResponse();

    await GET(req, res);

    const [sql] = dataCall(manager);
    expect(sql).toMatch(/ORDER BY v\.inventory_quantity ASC, v\.id ASC/);
  });

  it("orders descending for -inventory_quantity", async () => {
    const { req, manager } = makeRequest({ order: "-inventory_quantity" });
    const res = makeResponse();

    await GET(req, res);

    const [sql] = dataCall(manager);
    expect(sql).toMatch(/ORDER BY v\.inventory_quantity DESC, v\.id ASC/);
  });

  it("rejects unsupported order values with 400 and runs no query", async () => {
    const { req, manager } = makeRequest({ order: "title; DROP TABLE x" });
    const res = makeResponse();

    await GET(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it("searches barcode, sku and titles with bound parameters only", async () => {
    const searchText = "8410000';DROP--";
    const { req, manager } = makeRequest({ q: searchText });
    const res = makeResponse();

    await GET(req, res);

    const [sql, params] = dataCall(manager);
    expect(sql).toMatch(/v\.barcode ILIKE \$\d+/);
    expect(sql).toMatch(/v\.sku ILIKE \$\d+/);
    expect(sql).toMatch(/v\.title ILIKE \$\d+/);
    expect(sql).toMatch(/p\.title ILIKE \$\d+/);
    expect(sql).not.toContain("8410000");
    expect(sql).not.toContain("DROP");
    expect(params).toContain(`%${searchText}%`);
  });

  it("requires every whitespace-separated term to match some field", async () => {
    const { req, manager } = makeRequest({ q: "  jacket   large " });
    const res = makeResponse();

    await GET(req, res);

    const [sql, params] = dataCall(manager);
    expect(params).toEqual(expect.arrayContaining(["%jacket%", "%large%"]));
    expect(sql.match(/v\.barcode ILIKE/g)).toHaveLength(2);
  });

  it("escapes LIKE wildcards in search terms", async () => {
    const { req, manager } = makeRequest({ q: "50%_off" });
    const res = makeResponse();

    await GET(req, res);

    const [, params] = dataCall(manager);
    expect(params).toContain("%50\\%\\_off%");
  });

  it("passes limit and offset through and returns the total count", async () => {
    const { req, manager } = makeRequest({ limit: "10", offset: "30" });
    const res = makeResponse();

    await GET(req, res);

    const [sql, params] = dataCall(manager);
    expect(sql).toMatch(/LIMIT \$\d+ OFFSET \$\d+/);
    expect(params.slice(-2)).toEqual([10, 30]);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ count: 42, offset: 30, limit: 10 }),
    );
  });

  it("clamps limit to 100 and defaults to 20 / 0", async () => {
    const big = makeRequest({ limit: "5000" });
    await GET(big.req, makeResponse());
    expect(dataCall(big.manager)[1].slice(-2)).toEqual([100, 0]);

    const def = makeRequest({});
    await GET(def.req, makeResponse());
    expect(dataCall(def.manager)[1].slice(-2)).toEqual([20, 0]);
  });

  it("rejects invalid limit or offset with 400", async () => {
    const { req, manager } = makeRequest({ limit: "abc" });
    const res = makeResponse();

    await GET(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it("excludes soft-deleted variants, products and gift cards", async () => {
    const { req, manager } = makeRequest({});
    await GET(req, makeResponse());

    const [sql] = dataCall(manager);
    expect(sql).toMatch(/v\.deleted_at IS NULL/);
    expect(sql).toMatch(/p\.deleted_at IS NULL/);
    expect(sql).toMatch(/p\.is_giftcard = false/);
    expect(sql).toMatch(/ma\.deleted_at IS NULL/);
  });

  it("returns variants with barcode, stock_location_code and prices", async () => {
    const { req } = makeRequest({});
    const res = makeResponse();

    await GET(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      variants: [variantRow],
      count: 42,
      offset: 0,
      limit: 20,
    });
  });
});
