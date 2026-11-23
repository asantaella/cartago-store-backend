import ProductAlertStockEmailNotification from "../product-alert-stock-email-notification";
import type { ProductAlertSubscription } from "../../models/product-alert-subscription";

const variant = { title: "Default Title", sku: "SKU-1" };
const product = { title: "Product", handle: "product", thumbnail: "https://img" };

const makeSubscription = (id: string, email: string): ProductAlertSubscription =>
  ({ id, email, variant_id: "variant_1" }) as unknown as ProductAlertSubscription;

describe("ProductAlertStockEmailNotification.sendBackInStockNotifications", () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.BREVO_API_KEY;

  beforeAll(() => {
    process.env.BREVO_API_KEY = "test-key";
    delete process.env.ADMIN_EMAIL;
    delete process.env.MAILERSEND_ADMIN_EMAIL;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    process.env.BREVO_API_KEY = originalApiKey;
  });

  it("returns the ids of subscriptions sent and failed", async () => {
    global.fetch = jest.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      if (body.to[0].email === "bad@example.com") {
        return { ok: false, status: 400, text: async () => "invalid email" } as any;
      }
      return { ok: true, status: 201, json: async () => ({ messageId: "m" }) } as any;
    }) as any;

    const notifier = new ProductAlertStockEmailNotification();
    const result = await notifier.sendBackInStockNotifications(
      [
        makeSubscription("s1", "ok1@example.com"),
        makeSubscription("s2", "bad@example.com"),
        makeSubscription("s3", "ok2@example.com"),
      ],
      variant,
      product,
      "variant_1",
    );

    expect(result.sentIds.sort()).toEqual(["s1", "s3"]);
    expect(result.failedIds).toEqual(["s2"]);
  });

  it("never sends more than MAX_CONCURRENT_SENDS emails at the same time", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    global.fetch = jest.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return { ok: true, status: 201, json: async () => ({ messageId: "m" }) } as any;
    }) as any;

    const subscriptions = Array.from({ length: 12 }, (_, i) =>
      makeSubscription(`s${i}`, `user${i}@example.com`),
    );

    const notifier = new ProductAlertStockEmailNotification();
    const result = await notifier.sendBackInStockNotifications(
      subscriptions,
      variant,
      product,
      "variant_1",
    );

    expect(result.sentIds).toHaveLength(12);
    expect(result.failedIds).toHaveLength(0);
    expect(maxInFlight).toBeLessThanOrEqual(
      ProductAlertStockEmailNotification.MAX_CONCURRENT_SENDS,
    );
    expect(maxInFlight).toBeGreaterThan(1);
  });
});
