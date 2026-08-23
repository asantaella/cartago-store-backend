import { DELETE, POST } from "./route";
import DraftOrderPricingService from "../../../../../../../services/draft-order-pricing";

function makeRequest(body: any = {}) {
  const pricingService = new DraftOrderPricingService({} as any);
  const cart: any = {
    id: "cart_1",
    region_id: "reg_1",
    items: [
      {
        id: "line_1",
        variant_id: "variant_1",
        quantity: 2,
        subtotal: 2000,
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
  };
  const draftOrder: any = {
    id: "draft_1",
    cart_id: "cart_1",
    status: "open",
    cart,
  };
  const cartRepository = {
    findOne: jest.fn().mockResolvedValue(cart),
    save: jest.fn().mockResolvedValue(cart),
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
              updateLineItem: jest.fn().mockImplementation(async () => {
                // Medusa deletes shipping methods before updating a line item.
                cart.items[0].quantity = 3;
                cart.shipping_methods = [];
                return cart;
              }),
              removeLineItem: jest.fn().mockResolvedValue(undefined),
              retrieveWithTotals: jest.fn().mockImplementation(async () => ({
                ...cart,
                // Simulate native totals returning the stale persisted aggregate.
                shipping_total: 0,
                total: cart.subtotal,
              })),
            }),
          };
        }
        if (name === "draftOrderPricingService") return pricingService;
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
  return { req, cartRepository };
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
