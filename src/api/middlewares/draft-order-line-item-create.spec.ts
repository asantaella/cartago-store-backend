import { handleDraftOrderLineItemCreation } from "./draft-order-line-item-create";
import DraftOrderPricingService from "../../services/draft-order-pricing";
import ShippingSurchargeService from "../../services/shipping-surcharge";

function makeRequest(body: any) {
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
        discount_total: 0,
        metadata: {
          adjusted_unit_price: 2000,
          original_unit_price: 2000,
        },
        should_merge: true,
        variant: { shipping_option_price_extra: 150 },
      },
    ],
    shipping_methods: [
      {
        id: "shipping_1",
        price: 500,
        data: { shipping_extra_total: 0 },
        tax_total: 0,
        subtotal: 500,
        total: 500,
      },
    ],
    shipping_address: { country_code: "ES", postal_code: "35001" },
    region: { tax_rate: 21 },
    metadata: { territory_type: "canarias" },
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
    save: jest.fn().mockImplementation(async (savedCart: any) => savedCart),
  };
  const lineItemServiceTx = {
    generate: jest.fn().mockResolvedValue({
      id: "line_generated",
      variant_id: "variant_1",
      quantity: body.quantity,
      unit_price: body.unit_price,
      should_merge: true,
      metadata: body.metadata,
    }),
    update: jest.fn().mockImplementation(async (lineId: string, update: any) => {
      const item = cart.items.find((candidate: any) => candidate.id === lineId);
      Object.assign(item, update);
      item.subtotal = item.unit_price * item.quantity;
      return item;
    }),
    create: jest.fn(),
  };
  const lineItemService = {
    withTransaction: jest.fn().mockReturnValue(lineItemServiceTx),
  };
  const manager: any = {
    transaction: async (fn: any) => fn(manager),
    getRepository: jest.fn().mockImplementation((name: string) => {
      if (name === "Cart") return cartRepository;
      return {
        create: jest.fn((items: any[]) => items),
        remove: jest.fn(),
        save: jest.fn(),
      };
    }),
  };
  const req: any = {
    params: { id: "draft_1" },
    body,
    scope: {
      resolve: jest.fn((name: string) => {
        if (name === "manager") return manager;
        if (name === "draftOrderService") {
          return {
            withTransaction: () => ({
              retrieve: jest.fn().mockResolvedValue(draftOrder),
            }),
          };
        }
        if (name === "lineItemService") return lineItemService;
        if (name === "cartService") {
          return {
            withTransaction: () => ({
              retrieveWithTotals: jest.fn().mockResolvedValue(cart),
              decorateTotals: jest.fn().mockResolvedValue(cart),
              setPaymentSessions: jest.fn().mockResolvedValue(undefined),
            }),
          };
        }
        if (name === "draftOrderPricingService") return pricingService;
        if (name === "shippingSurchargeService") return surchargeService;
        if (name === "spanishTaxService") {
          return {
            isTaxExemptAddress: jest.fn().mockReturnValue(true),
            getTerritoryType: jest.fn().mockReturnValue("canarias"),
          };
        }
        throw new Error(`Unexpected dependency: ${name}`);
      }),
    },
  };
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return { req, res, next: jest.fn(), cartRepository };
}

describe("handleDraftOrderLineItemCreation", () => {
  it("uses an explicit unit price as the canonical price when merging an existing item", async () => {
    const { req, res, next, cartRepository } = makeRequest({
      variant_id: "variant_1",
      quantity: 1,
      unit_price: 1250,
      metadata: {
        adjusted_unit_price: 2000,
        original_unit_price: 2000,
      },
    });

    await handleDraftOrderLineItemCreation(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);

    const responseItem = res.json.mock.calls[0][0].draft_order.cart.items[0];
    expect(responseItem.quantity).toBe(3);
    expect(responseItem.unit_price).toBe(1250);
    expect(responseItem.metadata).toEqual(
      expect.objectContaining({
        adjusted_unit_price: 1250,
        original_unit_price: 1250,
      }),
    );

    const persistedCart =
      cartRepository.save.mock.calls[cartRepository.save.mock.calls.length - 1][0];
    expect(persistedCart.items[0].quantity).toBe(3);
    expect(persistedCart.items[0].unit_price).toBe(1250);
    expect(persistedCart.items[0].metadata).toEqual(
      expect.objectContaining({
        adjusted_unit_price: 1250,
        original_unit_price: 1250,
      }),
    );
  });
});
