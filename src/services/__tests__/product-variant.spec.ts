import { ProductVariantService as MedusaProductVariantService } from "@medusajs/medusa";
import ProductVariantService from "../product-variant";

const STOCK_SNAPSHOT_KEY = "stock_zero_alert_last_inventory_quantity";

describe("product variant service", () => {
  let baseUpdate: jest.SpyInstance;

  beforeEach(() => {
    baseUpdate = jest
      .spyOn(MedusaProductVariantService.prototype, "update")
      .mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createService = () =>
    new ProductVariantService({ manager: {} } as any);

  it("removes a client snapshot from scalar updates and preserves other metadata", async () => {
    const service = createService();

    await service.update("var_01", {
      metadata: {
        color: "blue",
        [STOCK_SNAPSHOT_KEY]: 0,
      },
    });

    expect(baseUpdate).toHaveBeenCalledWith("var_01", {
      metadata: { color: "blue" },
    });
  });

  it("removes client snapshots from batch updates and preserves other metadata", async () => {
    const service = createService();
    const variant = { id: "var_01" } as any;

    await service.update([
      {
        variant,
        updateData: {
          metadata: {
            color: "blue",
            [STOCK_SNAPSHOT_KEY]: 0,
          },
        },
      },
    ]);

    expect(baseUpdate).toHaveBeenCalledWith([
      {
        variant,
        updateData: { metadata: { color: "blue" } },
      },
    ]);
  });

  it("allows the trusted snapshot writer to persist the reserved metadata key", async () => {
    const service = createService();

    await service.updateStockSnapshot("var_01", 0);

    expect(baseUpdate).toHaveBeenCalledWith("var_01", {
      metadata: { [STOCK_SNAPSHOT_KEY]: 0 },
    });
  });
});
