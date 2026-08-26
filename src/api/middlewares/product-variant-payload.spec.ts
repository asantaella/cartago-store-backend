import { validator } from "@medusajs/medusa";
import { config } from "../middlewares";
import { AdminPostProductsProductVariantsVariantReq } from "@medusajs/medusa/dist/api/routes/admin/products/update-variant";
import {
  extendProductVariantPatchPayload,
  extendProductVariantPostPayload,
} from "./product-variant-payload";

function runMiddleware(
  middleware: (req: any, res: any, next: jest.Mock) => void,
  body: unknown,
) {
  const req = { body };
  const next = jest.fn();

  middleware(req, {}, next);

  return { req, next };
}

describe("product variant payload middleware", () => {
  it("registers separate POST and PATCH middleware routes", () => {
    const postRoute = config.routes?.find(
      (route) =>
        route.matcher === "/admin/products/:id/variants/:variant_id" &&
        route.method === "POST",
    );
    const patchRoute = config.routes?.find(
      (route) =>
        route.matcher === "/admin/products/:id/variants/:variant_id" &&
        route.method === "PATCH",
    );

    expect(postRoute?.middlewares).toContain(extendProductVariantPostPayload);
    expect(patchRoute?.middlewares).toContain(extendProductVariantPatchPayload);
  });

  it("preserves Cartago fields for POST", () => {
    const { req, next } = runMiddleware(extendProductVariantPostPayload, {
      title: "Updated variant",
      stock_location_code: "A1",
      shipping_option_price_extra: 150,
    });

    expect(req.body).toEqual({
      title: "Updated variant",
      stock_location_code: "A1",
      shipping_option_price_extra: 150,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("preserves Cartago fields for PATCH", () => {
    const { req, next } = runMiddleware(extendProductVariantPatchPayload, {
      stock_location_code: "B2",
      shipping_option_price_extra: 200,
    });

    expect(req.body).toEqual({
      stock_location_code: "B2",
      shipping_option_price_extra: 200,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does not add custom fields when they are omitted", () => {
    const body = { title: "Updated variant" };
    const { req } = runMiddleware(extendProductVariantPostPayload, body);

    expect(req.body).toEqual(body);
    expect(req.body).not.toBe(body);
  });
});

describe("native product variant update validator", () => {
  it("accepts the custom fields through the native validator", async () => {
    const validated = await validator(AdminPostProductsProductVariantsVariantReq, {
      title: "Updated variant",
      stock_location_code: "A1",
      shipping_option_price_extra: 150,
    });

    expect(validated).toMatchObject({
      title: "Updated variant",
      stock_location_code: "A1",
      shipping_option_price_extra: 150,
    });
  });

  it.each(["A1", "Z100"])(
    "accepts a valid stock_location_code %s",
    async (stock_location_code) => {
      await expect(
        validator(AdminPostProductsProductVariantsVariantReq, {
          stock_location_code,
        }),
      ).resolves.toMatchObject({ stock_location_code });
    },
  );

  it("allows an omitted stock_location_code", async () => {
    await expect(
      validator(AdminPostProductsProductVariantsVariantReq, {
        title: "Updated variant",
      }),
    ).resolves.toMatchObject({ title: "Updated variant" });
  });

  it("allows null to clear stock_location_code", async () => {
    await expect(
      validator(AdminPostProductsProductVariantsVariantReq, {
        stock_location_code: null,
      }),
    ).resolves.toMatchObject({ stock_location_code: null });
  });

  it("normalizes an empty stock_location_code input to null", async () => {
    const { req } = runMiddleware(extendProductVariantPostPayload, {
      stock_location_code: "",
    });

    expect(req.body).toMatchObject({ stock_location_code: null });
    await expect(
      validator(AdminPostProductsProductVariantsVariantReq, req.body),
    ).resolves.toMatchObject({ stock_location_code: null });
  });

  it.each(["A0", "A101", "AA1", "a1", "A01", " A1 ", 1, {}])(
    "rejects invalid stock_location_code %p",
    async (value) => {
      await expect(
        validator(AdminPostProductsProductVariantsVariantReq, {
          stock_location_code: value,
        }),
      ).rejects.toThrow();
    },
  );

  it("treats an empty string as an omitted surcharge", async () => {
    const { req } = runMiddleware(extendProductVariantPostPayload, {
      shipping_option_price_extra: "",
    });

    await expect(
      validator(AdminPostProductsProductVariantsVariantReq, req.body),
    ).resolves.toBeDefined();
  });

  it.each([-1, 1.5, "150", null])(
    "rejects invalid shipping_option_price_extra %p",
    async (value) => {
      await expect(
        validator(AdminPostProductsProductVariantsVariantReq, {
          shipping_option_price_extra: value,
        }),
      ).rejects.toThrow();
    },
  );
});
