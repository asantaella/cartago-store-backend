import {
  config,
  processVariantStockUpdate,
} from "../variant-stock-update";

const STOCK_SNAPSHOT_KEY = "stock_zero_alert_last_inventory_quantity";

function buildContainer(variants: Record<string, any>[]) {
  const productVariantService = {
    retrieve: jest.fn().mockImplementation(async () => variants.shift()),
    updateStockSnapshot: jest.fn().mockResolvedValue(undefined),
  };
  const productAlertService = {
    getPendingCount: jest.fn().mockResolvedValue(1),
    processBackInStock: jest.fn().mockResolvedValue(undefined),
    notifyAdminStockZero: jest.fn().mockResolvedValue(undefined),
  };
  const container = {
    resolve: jest.fn((name: string) => {
      if (name === "productVariantService") return productVariantService;
      if (name === "productAlertService") return productAlertService;
      throw new Error(`Unknown service: ${name}`);
    }),
  };

  return { container, productVariantService, productAlertService };
}

const stockUpdate = (container: any, data: Record<string, unknown>) =>
  processVariantStockUpdate({
    data,
    eventName: "product-variant.updated",
    container,
    pluginOptions: {},
  } as any);

describe("variant-stock-update subscriber", () => {
  it("tracks inventory and notifies on a positive-to-zero transition", async () => {
    const { container, productVariantService, productAlertService } =
      buildContainer([
        {
          id: "var_01",
          inventory_quantity: 0,
          metadata: {
            existing_key: "preserved",
            [STOCK_SNAPSHOT_KEY]: 4,
          },
        },
      ]);

    await stockUpdate(container, {
      id: "var_01",
      fields: ["inventory_quantity"],
    });

    expect(productVariantService.updateStockSnapshot).toHaveBeenCalledWith(
      "var_01",
      0,
    );
    expect(productAlertService.notifyAdminStockZero).toHaveBeenCalledWith(
      "var_01",
    );
  });

  it("sends another stock-zero alert after stock is replenished", async () => {
    const { container, productAlertService } = buildContainer([
      {
        id: "var_01",
        inventory_quantity: 5,
        metadata: { [STOCK_SNAPSHOT_KEY]: 0 },
      },
      {
        id: "var_01",
        inventory_quantity: 0,
        metadata: { [STOCK_SNAPSHOT_KEY]: 5 },
      },
    ]);

    await stockUpdate(container, {
      id: "var_01",
      fields: ["inventory_quantity"],
    });
    await stockUpdate(container, {
      id: "var_01",
      fields: ["inventory_quantity"],
    });

    expect(productAlertService.processBackInStock).toHaveBeenCalledWith(
      "var_01",
    );
    expect(productAlertService.notifyAdminStockZero).toHaveBeenCalledTimes(1);
  });

  it("initializes a newly created variant without sending an alert", async () => {
    const { container, productVariantService, productAlertService } =
      buildContainer([
        {
          id: "var_new",
          inventory_quantity: 3,
          metadata: { existing_key: "preserved" },
        },
      ]);

    await processVariantStockUpdate({
      data: { id: "var_new" },
      eventName: "product-variant.created",
      container,
      pluginOptions: {},
    } as any);

    expect(productVariantService.updateStockSnapshot).toHaveBeenCalledWith(
      "var_new",
      3,
    );
    expect(productAlertService.notifyAdminStockZero).not.toHaveBeenCalled();
  });

  it("ignores variant updates that did not change inventory", async () => {
    const { container, productVariantService, productAlertService } =
      buildContainer([]);

    await stockUpdate(container, { id: "var_01", fields: ["metadata"] });

    expect(container.resolve).not.toHaveBeenCalled();
    expect(productVariantService.retrieve).not.toHaveBeenCalled();
    expect(productAlertService.notifyAdminStockZero).not.toHaveBeenCalled();
  });

  it.each([
    ["numeric", { [STOCK_SNAPSHOT_KEY]: 4 }, "4"],
    ["missing", {}, "missing"],
    ["non-numeric", { [STOCK_SNAPSHOT_KEY]: "4" }, "non-numeric"],
  ])(
    "logs a stock snapshot diagnostic with a %s prior snapshot",
    async (_caseName, metadata, priorSnapshot) => {
      const originalAdminEmail = process.env.ADMIN_EMAIL;
      const adminEmail = "admin@example.com";
      process.env.ADMIN_EMAIL = adminEmail;
      const diagnostic = jest.spyOn(console, "log").mockImplementation(() => {});
      const { container } = buildContainer([
        {
          id: "var_01",
          inventory_quantity: 0,
          metadata,
        },
      ]);

      await stockUpdate(container, {
        id: "var_01",
        fields: ["inventory_quantity"],
      });

      expect(diagnostic).toHaveBeenCalledWith(
        `[STOCK-ZERO-SNAPSHOT-DIAG] variant_id=var_01 prior_snapshot=${priorSnapshot} current_inventory_quantity=0 admin_email_configured=true`,
      );
      expect(diagnostic.mock.calls[0][0]).not.toContain(adminEmail);

      diagnostic.mockRestore();
      if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = originalAdminEmail;
    },
  );

  it("keeps the stock update successful when the admin email fails", async () => {
    const { container, productVariantService, productAlertService } =
      buildContainer([
        {
          id: "var_01",
          inventory_quantity: 0,
          metadata: { [STOCK_SNAPSHOT_KEY]: 2 },
        },
      ]);
    productAlertService.notifyAdminStockZero.mockRejectedValue(
      new Error("mail unavailable"),
    );
    const error = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      stockUpdate(container, { id: "var_01", fields: ["inventory_quantity"] }),
    ).resolves.toBeUndefined();

    expect(productVariantService.updateStockSnapshot).toHaveBeenCalledWith(
      "var_01",
      0,
    );
    error.mockRestore();
  });

  it("subscribes to creation for new-variant snapshot initialization", () => {
    expect(config.event).toEqual(
      expect.arrayContaining([
        "product-variant.created",
        "product-variant.updated",
      ]),
    );
  });
});
