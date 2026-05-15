import handleShipmentCreated from "../shipment-created";

function buildContainer({
  fulfillment = null,
}: {
  fulfillment?: Record<string, unknown> | null;
} = {}) {
  const mockFulfillmentRepo = {
    findOne: jest.fn().mockResolvedValue(fulfillment),
  };

  const mockShipmentNotificationService = {
    sendNotification: jest.fn().mockResolvedValue(undefined),
  };

  const mockManager = {
    getRepository: jest.fn().mockReturnValue(mockFulfillmentRepo),
  };

  return {
    container: {
      resolve: jest.fn().mockImplementation((name: string) => {
        if (name === "shipmentNotificationService")
          return mockShipmentNotificationService;
        if (name === "manager") return mockManager;
        throw new Error(`Unknown service: ${name}`);
      }),
    },
    mocks: {
      fulfillmentRepo: mockFulfillmentRepo,
      shipmentNotificationService: mockShipmentNotificationService,
    },
  };
}

const baseOrder = {
  id: "ord_01",
  display_id: 1,
  metadata: {},
};

const baseFulfillment = {
  id: "ful_01",
  order: baseOrder,
  order_id: "ord_01",
};

describe("shipment-created subscriber", () => {
  const baseData = { id: "ful_01", fulfillment_id: "ful_01" };

  it("does not assign an invoice number", async () => {
    const { container, mocks } = buildContainer({
      fulfillment: {
        ...baseFulfillment,
        order: { ...baseOrder, metadata: {} },
      },
    });

    await handleShipmentCreated({
      data: baseData,
      eventName: "order.shipment_created",
      container: container as any,
      pluginOptions: {},
    });

    expect(
      mocks.shipmentNotificationService.sendNotification,
    ).toHaveBeenCalled();
  });

  it("does not assign invoice number even if order already has one", async () => {
    const orderWithInvoice = {
      ...baseOrder,
      metadata: { invoice_number: "2026-00010" },
    };

    const { container, mocks } = buildContainer({
      fulfillment: { ...baseFulfillment, order: orderWithInvoice },
    });

    await handleShipmentCreated({
      data: baseData,
      eventName: "order.shipment_created",
      container: container as any,
      pluginOptions: {},
    });

    expect(
      mocks.shipmentNotificationService.sendNotification,
    ).toHaveBeenCalled();
  });

  it("returns early without notification when fulfillment is not found", async () => {
    const { container, mocks } = buildContainer({ fulfillment: null });

    await handleShipmentCreated({
      data: baseData,
      eventName: "order.shipment_created",
      container: container as any,
      pluginOptions: {},
    });

    expect(
      mocks.shipmentNotificationService.sendNotification,
    ).not.toHaveBeenCalled();
  });
});
