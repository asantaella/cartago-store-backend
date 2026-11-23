jest.mock("../product-alert-stock-email-notification", () => ({
  __esModule: true,
  default: jest.fn(),
}));

import ProductAlertService from "../product-alert";

const buildService = (query: jest.Mock) =>
  new ProductAlertService({
    manager: { query },
    productAlertSubscriptionRepository: {},
    productVariantService: {},
    productService: {},
  });

describe("ProductAlertService active subscriptions", () => {
  it("lists variants with pending subscriptions and casts numeric columns", async () => {
    const lastSubscribedAt = new Date("2026-11-20T10:00:00Z");
    const query = jest.fn().mockResolvedValue([
      {
        variant_id: "variant_1",
        variant_title: "Red / L",
        sku: "SKU-1",
        inventory_quantity: "0",
        product_id: "prod_1",
        product_title: "Bumper",
        thumbnail: null,
        subscriber_count: "3",
        last_subscribed_at: lastSubscribedAt,
      },
      {
        variant_id: "variant_deleted",
        variant_title: null,
        sku: null,
        inventory_quantity: null,
        product_id: null,
        product_title: null,
        thumbnail: null,
        subscriber_count: "1",
        last_subscribed_at: lastSubscribedAt,
      },
    ]);

    const result = await buildService(query).listVariantsWithActiveSubscriptions();

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("FROM product_alert_subscription"),
      ["pending"],
    );
    expect(result).toEqual([
      expect.objectContaining({
        variant_id: "variant_1",
        inventory_quantity: 0,
        subscriber_count: 3,
      }),
      expect.objectContaining({
        variant_id: "variant_deleted",
        inventory_quantity: null,
        subscriber_count: 1,
      }),
    ]);
  });

  it("lists pending subscribers of a variant", async () => {
    const subscriber = {
      id: "pas_1",
      email: "jane@example.com",
      created_at: new Date("2026-11-20T10:00:00Z"),
      customer_id: "cus_1",
      first_name: "Jane",
      last_name: "Doe",
    };
    const query = jest.fn().mockResolvedValue([subscriber]);

    const result = await buildService(query).listActiveSubscribers("variant_1");

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE s.variant_id = $1"),
      ["variant_1", "pending"],
    );
    expect(result).toEqual([subscriber]);
  });
});
