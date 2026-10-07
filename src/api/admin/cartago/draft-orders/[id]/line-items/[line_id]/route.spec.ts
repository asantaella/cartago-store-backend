import { DELETE, POST } from "../../../../../draft-orders/[id]/line-items/[line_id]/route";
import DraftOrderPricingService from "../../../../../../../services/draft-order-pricing";
import ShippingSurchargeService from "../../../../../../../services/shipping-surcharge";

function makeRequest(body: any = {}) {
  const pricingService = new DraftOrderPricingService({} as any);
  const surchargeService = new ShippingSurchargeService();
  const cart: any = {
    id: "cart_1",
    region_id: "reg_1",
    items: [
      {
        id: "line_1",
        variant_id: "variant_1",
        quantity: 2,
        unit_price: 2000,
        subtotal: 4000,
        metadata: {
          adjusted_unit_price: 2000,
          original_unit_price: 2000,
        },
        variant: { shipping_option_price_extra: 150 },
      },
    ],
    shipping_methods: [
      {
        id: "shipping_1",
        price: 500,
        data: { shipping_extra_total: 0 },
        tax_total: 0,
      },
    ],
    payment_sessions: [],
    tax_total: 0,
    gift_card_total: 0,
    shipping_address: { country_code: "ES", postal_code: "28001" },
    region: { tax_rate: 21 },
    metadata: { territory_type: "standard" },
  };
  const draftOrder: any = {
    id: "draft_1",
    cart_id: "cart_1",
    status: "open",
    cart,
  };
  const cartRepository = {
    findOne: jest.fn().mockResolvedValue(cart),
    save: jest.fn().mockImplementation(async (savedCart: any) => savedCart),
  };
  const manager: any = {
    transaction: async (fn: any) => fn(manager),
    getRepository: jest.fn().mockImplementation((name: string) => {
      if (name === "Cart") return cartRepository;
      return { create: jest.fn((items: any[]) => items), save: jest.fn() };
    }),
  };
  const req: any = {
    params: { id: "draft_1", line_id: "line_1" },
    body,
    scope: {
      resolve: jest.fn((name: string) => {
        if (name === "manager") return manager;
        if (name === "draftOrderService") {
          return {
            withTransaction: () => ({ retrieve: jest.fn().mockResolvedValue(draftOrder) }),
          };
        }
        if (name === "cartService") {
          return {
            withTransaction: () => ({
              updateLineItem: jest.fn().mockImplementation(
                async (_cartId: string, _lineId: string, update: any) => {
                  // Medusa deletes shipping methods before updating a line item.
                  Object.assign(cart.items[0], update);
                  cart.items[0].subtotal =
                    cart.items[0].unit_price * cart.items[0].quantity;
                  cart.shipping_methods = [];
                  return cart.items[0];
                },
              ),
              removeLineItem: jest.fn().mockResolvedValue(undefined),
              retrieveWithTotals: jest.fn().mockImplementation(async () => ({
                ...cart,
                // Simulate native totals returning the stale persisted aggregate.
                shipping_total: 0,
                total: cart.subtotal,
              })),
              decorateTotals: jest.fn().mockImplementation(async (currentCart: any) => {
                currentCart.shipping_total = (currentCart.shipping_methods || [])
                  .reduce((sum: number, method: any) => sum + method.price, 0);
                currentCart.total =
                  (currentCart.subtotal || 0) + currentCart.shipping_total;
                return currentCart;
              }),
              setPaymentSessions: jest.fn().mockResolvedValue(undefined),
            }),
          };
        }
        if (name === "draftOrderPricingService") return pricingService;
        if (name === "shippingSurchargeService") return surchargeService;
        if (name === "spanishTaxService") {
          return {
            isTaxExemptAddress: jest.fn().mockReturnValue(false),
            getTerritoryType: jest.fn().mockReturnValue("standard"),
          };
        }
        throw new Error(`Unexpected dependency: ${name}`);
      }),
    },
  };
  return { req, cart, cartRepository };
}

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as any;
}

describe("custom draft-order line-item endpoints", () => {
  it("updates a line item and returns totals from the native cart flow", async () => {
    const { req, cartRepository } = makeRequest({ quantity: 3 });
    const res = makeResponse();

    await POST(req, res);

    expect(cartRepository.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ draft_order: expect.anything() }),
    );
  });

  it("uses an explicit unit price as the canonical price in the response and saved cart", async () => {
    const { req, cartRepository } = makeRequest({
      quantity: 2,
      unit_price: 1250,
    });
    const res = makeResponse();

    await POST(req, res);

    const responseItem = res.json.mock.calls[0][0].draft_order.cart.items[0];
    expect(responseItem.unit_price).toBe(1250);
    expect(responseItem.metadata).toEqual(
      expect.objectContaining({
        adjusted_unit_price: 1250,
        original_unit_price: 1250,
      }),
    );

    const persistedCart =
      cartRepository.save.mock.calls[cartRepository.save.mock.calls.length - 1][0];
    expect(persistedCart.items[0].unit_price).toBe(1250);
    expect(persistedCart.items[0].metadata).toEqual(
      expect.objectContaining({
        adjusted_unit_price: 1250,
        original_unit_price: 1250,
      }),
    );
  });

  it("preserves standard-price restoration for a non-explicit quantity edit", async () => {
    const { req, cartRepository, cart } = makeRequest({ quantity: 3 });
    cart.metadata.territory_type = "canarias";
    cart.items[0].unit_price = 1653;
    cart.items[0].subtotal = 3306;
    cart.items[0].metadata = {
      adjusted_unit_price: 1653,
      original_unit_price: 2000,
    };
    const res = makeResponse();

    await POST(req, res);

    const persistedCart =
      cartRepository.save.mock.calls[cartRepository.save.mock.calls.length - 1][0];
    expect(persistedCart.items[0].unit_price).toBe(2000);
    expect(persistedCart.items[0].quantity).toBe(3);
  });

  it("preserves shipping total and variant extra after native shipping removal", async () => {
    const { req } = makeRequest({ quantity: 3 });
    const res = makeResponse();

    await POST(req, res);

    const response = res.json.mock.calls[0][0].draft_order.cart;
    expect(response.shipping_total).toBe(950);
    expect(response.shipping_methods[0].price).toBe(950);
    expect(response.shipping_methods[0].data.shipping_extra_total).toBe(450);
  });

  it("rejects a negative quantity before mutating the cart", async () => {
    const { req, cartRepository } = makeRequest({ quantity: -1 });
    const res = makeResponse();

    await expect(POST(req, res)).rejects.toMatchObject({ type: "invalid_data" });
    expect(cartRepository.save).not.toHaveBeenCalled();
  });

  it("removes a line item through the native cart service", async () => {
    const { req, cartRepository } = makeRequest();
    const res = makeResponse();

    await DELETE(req, res);

    expect(cartRepository.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
