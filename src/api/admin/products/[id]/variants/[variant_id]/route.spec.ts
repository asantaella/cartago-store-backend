import {
  PATCH,
  POST,
  isValidStockLocationCode,
} from "./route";

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as any;
}

function makeRequest(body: unknown) {
  const productService = { retrieve: jest.fn().mockResolvedValue({ id: "prod_1" }) };
  const productVariantService = {
    retrieve: jest.fn().mockResolvedValue({ id: "var_1", product_id: "prod_1" }),
    update: jest.fn().mockResolvedValue({ id: "var_1" }),
  };

  return {
    req: {
      params: { id: "prod_1", variant_id: "var_1" },
      body,
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === "productService") return productService;
          if (name === "productVariantService") return productVariantService;
          throw new Error(`Unexpected dependency: ${name}`);
        }),
      },
    } as any,
    res: makeResponse(),
    productVariantService,
  };
}

describe("stock location code validation", () => {
  it.each(["A1", "Z100"])("accepts %s", (value) => {
    expect(isValidStockLocationCode(value)).toBe(true);
  });

  it.each(["A0", "A101", "AA1", "a1", "A01", "", " A1 ", 1, null, undefined, {}])(
    "rejects %p",
    (value) => {
      expect(isValidStockLocationCode(value)).toBe(false);
    },
  );
});

describe("POST product variant", () => {
  it.each(["A0", "A101", "AA1", "a1", "A01", "", " A1 ", 1, {}])(
    "returns HTTP 400 for invalid stock_location_code %p without updating",
    async (value) => {
      const { req, res, productVariantService } = makeRequest({
        stock_location_code: value,
      });

      await POST(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(productVariantService.update).not.toHaveBeenCalled();
    },
  );

  it.each(["A1", "Z100"])("forwards a valid stock_location_code %s", async (value) => {
    const { req, res, productVariantService } = makeRequest({
      stock_location_code: value,
    });

    await POST(req, res);

    expect(productVariantService.update).toHaveBeenCalledWith("var_1", {
      stock_location_code: value,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("forwards explicit null to clear stock_location_code", async () => {
    const { req, res, productVariantService } = makeRequest({
      stock_location_code: null,
    });

    await POST(req, res);

    expect(productVariantService.update).toHaveBeenCalledWith("var_1", {
      stock_location_code: null,
    });
  });

  it("forwards an omitted stock_location_code without injecting it", async () => {
    const body = { title: "Updated variant" };
    const { req, res, productVariantService } = makeRequest(body);

    await POST(req, res);

    expect(productVariantService.update).toHaveBeenCalledWith("var_1", body);
    expect(productVariantService.update.mock.calls[0][1]).not.toHaveProperty(
      "stock_location_code",
    );
  });

  it("forwards standard variant fields alongside stock_location_code", async () => {
    const body = { title: "Updated variant", stock_location_code: "A1" };
    const { req, res, productVariantService } = makeRequest(body);

    await POST(req, res);

    expect(productVariantService.update).toHaveBeenCalledWith("var_1", body);
  });
});

describe("PATCH product variant", () => {
  it.each(["A0", "A101", "AA1", "a1", "A01", "", " A1 ", 1, {}])(
    "returns HTTP 400 for invalid stock_location_code %p",
    async (value) => {
      const { req, res, productVariantService } = makeRequest({
        stock_location_code: value,
      });

      await PATCH(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(productVariantService.update).not.toHaveBeenCalled();
    },
  );

  it.each(["A1", "Z100"])("forwards a valid stock_location_code %s", async (value) => {
    const { req, res, productVariantService } = makeRequest({
      stock_location_code: value,
    });

    await PATCH(req, res);

    expect(productVariantService.update).toHaveBeenCalledWith("var_1", {
      stock_location_code: value,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("forwards null to clear stock_location_code", async () => {
    const { req, res, productVariantService } = makeRequest({
      stock_location_code: null,
    });

    await PATCH(req, res);

    expect(productVariantService.update).toHaveBeenCalledWith("var_1", {
      stock_location_code: null,
    });
  });

  it("omits stock_location_code from the update when not provided", async () => {
    const { req, res, productVariantService } = makeRequest({});

    await PATCH(req, res);

    expect(productVariantService.update).toHaveBeenCalledWith("var_1", {});
  });
});
