import ProductAlertService from "../product-alert";
import {
  ProductAlertStatus,
  type ProductAlertSubscription,
} from "../../models/product-alert-subscription";

const makeSubscription = (id: string): ProductAlertSubscription =>
  ({
    id,
    email: `${id}@example.com`,
    variant_id: "variant_1",
    status: ProductAlertStatus.PENDING,
    notified_at: null,
  }) as unknown as ProductAlertSubscription;

const buildService = (subscriptions: ProductAlertSubscription[]) => {
  const repo = {
    find: jest.fn(async () => subscriptions),
    save: jest.fn(async (subscription: ProductAlertSubscription) => subscription),
  };

  const container = {
    productAlertSubscriptionRepository: repo,
    productVariantService: {},
    productService: {},
  };

  const service = new ProductAlertService(container as any) as any;

  // Run each "transactional" phase without a real database transaction.
  service.atomicPhase_ = async (fn: (manager: any) => Promise<any>) =>
    fn({ withRepository: () => repo });

  service.validator = {
    validateVariant: jest.fn(async () => ({
      variant: { title: "Default Title", sku: "SKU" },
      product: { title: "Product", handle: "product", thumbnail: "img" },
    })),
  };

  service.notifier = {
    sendBackInStockNotifications: jest.fn(),
  };

  return { service, repo };
};

describe("ProductAlertService.processBackInStock", () => {
  it("marks as notified only the subscriptions whose email was sent", async () => {
    const subscriptions = [makeSubscription("s1"), makeSubscription("s2")];
    const { service, repo } = buildService(subscriptions);
    service.notifier.sendBackInStockNotifications.mockResolvedValue({
      sentIds: ["s1"],
      failedIds: ["s2"],
    });

    await service.processBackInStock("variant_1");

    expect(repo.save).toHaveBeenCalledTimes(1);
    const saved = repo.save.mock.calls[0][0];
    expect(saved.id).toBe("s1");
    expect(saved.status).toBe(ProductAlertStatus.NOTIFIED);
    expect(saved.notified_at).toBeInstanceOf(Date);
    expect(subscriptions[1].status).toBe(ProductAlertStatus.PENDING);
  });

  it("keeps every subscription pending when the notifier throws", async () => {
    const subscriptions = [makeSubscription("s1"), makeSubscription("s2")];
    const { service, repo } = buildService(subscriptions);
    service.notifier.sendBackInStockNotifications.mockRejectedValue(
      new Error("boom"),
    );

    await service.processBackInStock("variant_1");

    expect(repo.save).not.toHaveBeenCalled();
    expect(subscriptions.map((s) => s.status)).toEqual([
      ProductAlertStatus.PENDING,
      ProductAlertStatus.PENDING,
    ]);
  });

  it("does not send or mark anything when the variant cannot be validated", async () => {
    const subscriptions = [makeSubscription("s1")];
    const { service, repo } = buildService(subscriptions);
    service.validator.validateVariant.mockResolvedValue(null);

    await service.processBackInStock("variant_1");

    expect(service.notifier.sendBackInStockNotifications).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
