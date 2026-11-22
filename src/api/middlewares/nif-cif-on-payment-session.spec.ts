import {
  NIF_CIF_REQUIRED_CODE,
  requireNifCifOnPaymentSession,
} from "./nif-cif-on-payment-session";

type CartOverrides = Record<string, unknown>;

function makeCart(overrides: CartOverrides = {}) {
  return {
    id: "cart_1",
    total: 40_000,
    region: { currency_code: "eur" },
    shipping_address: { metadata: {} },
    billing_address: { metadata: {} },
    ...overrides,
  };
}

function setup(cart: unknown, retrieveError?: Error) {
  const retrieveWithTotals = retrieveError
    ? jest.fn().mockRejectedValue(retrieveError)
    : jest.fn().mockResolvedValue(cart);
  const req: any = {
    params: { id: "cart_1" },
    scope: { resolve: jest.fn().mockReturnValue({ retrieveWithTotals }) },
  };
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next, retrieveWithTotals };
}

describe("requireNifCifOnPaymentSession", () => {
  it("rejects EUR carts of €400 or more without NIF/CIF before the route runs", async () => {
    const { req, res, next, retrieveWithTotals } = setup(makeCart());

    await requireNifCifOnPaymentSession(req, res, next);

    expect(req.scope.resolve).toHaveBeenCalledWith("cartService");
    expect(retrieveWithTotals).toHaveBeenCalledWith(
      "cart_1",
      expect.objectContaining({
        relations: expect.arrayContaining([
          "region",
          "shipping_address",
          "billing_address",
        ]),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      type: "not_allowed",
      code: NIF_CIF_REQUIRED_CODE,
      message: expect.stringContaining("NIF/CIF"),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("uses the nif_cif_required error code", () => {
    expect(NIF_CIF_REQUIRED_CODE).toBe("nif_cif_required");
  });

  it.each([
    ["a NIF/CIF on the shipping address", { shipping_address: { metadata: { nif_cif: "B12345678" } } }],
    ["a NIF/CIF on the billing address", { billing_address: { metadata: { nif_cif: "12345678Z" } } }],
    ["a total below €400", { total: 39_999 }],
    ["a non-EUR region", { region: { currency_code: "usd" } }],
  ])("lets carts with %s continue", async (_label, overrides) => {
    const { res, req, next } = setup(makeCart(overrides));

    await requireNifCifOnPaymentSession(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("lets requests without a cart id reach the route", async () => {
    const { req, res, next, retrieveWithTotals } = setup(makeCart());
    req.params = {};

    await requireNifCifOnPaymentSession(req, res, next);

    expect(retrieveWithTotals).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it("is registered on payment-session selection routes but not on session creation", () => {
    const { config } = require("../middlewares");
    const guarded = config.routes
      .filter((route: any) =>
        route.middlewares?.includes(requireNifCifOnPaymentSession),
      )
      .map((route: any) => [route.matcher, route.method]);

    expect(guarded).toEqual([
      ["/store/carts/:id/payment-session", "POST"],
      ["/store/carts/:id/payment-session-context", "POST"],
      ["/store/carts/:id/payment-sessions/:provider_id", "POST"],
      ["/store/carts/:id/payment-sessions/:provider_id/refresh", "POST"],
    ]);
    expect(guarded).not.toContainEqual([
      "/store/carts/:id/payment-sessions",
      "POST",
    ]);
  });

  it("forwards cart lookup errors to the error handler instead of skipping the check", async () => {
    const error = new Error("Cart with cart_1 was not found");
    const { req, res, next } = setup(null, error);

    await requireNifCifOnPaymentSession(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});
