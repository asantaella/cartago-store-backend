import handleOrderPlaced from "../payment-captured";

function buildContainer({
  order = null,
  invoiceService = {},
}: {
  order?: Record<string, unknown> | null;
  invoiceService?: Record<string, unknown>;
} = {}) {
  const mockOrderService = {
    retrieveWithTotals: jest.fn().mockResolvedValue(order),
  };

  const mockInvoiceService = {
    setOrderInvoiceNumber: jest.fn().mockResolvedValue("2026-00001"),
    ...invoiceService,
  };

  const mockReceiptNotificationService = {
    sendNotification: jest.fn().mockResolvedValue(undefined),
  };

  const mockShipmentNotificationService = {
    sendInvoiceNotification: jest.fn().mockResolvedValue(undefined),
  };

  const mockPlaceOrderEmailNotificationService = {
    sendNotification: jest.fn().mockResolvedValue(undefined),
  };

  return {
    container: {
      resolve: jest.fn().mockImplementation((name: string) => {
        if (name === "orderService") return mockOrderService;
        if (name === "invoiceNumberGeneratorService") return mockInvoiceService;
        if (name === "receiptNotificationService")
          return mockReceiptNotificationService;
        if (name === "shipmentNotificationService")
          return mockShipmentNotificationService;
        if (name === "placeOrderEmailNotificationService")
          return mockPlaceOrderEmailNotificationService;
        throw new Error(`Unknown service: ${name}`);
      }),
    },
    mocks: {
      orderService: mockOrderService,
      invoiceService: mockInvoiceService,
      receiptNotificationService: mockReceiptNotificationService,
      shipmentNotificationService: mockShipmentNotificationService,
      placeOrderEmailNotificationService:
        mockPlaceOrderEmailNotificationService,
    },
  };
}

const baseOrder = {
  id: "ord_01",
  display_id: 1,
  fulfillment_status: "not_fulfilled",
  metadata: {},
  payments: [],
};

describe("payment-captured subscriber", () => {
  const baseData = { id: "ord_01" };

  it("assigns an invoice number when the order does not have one", async () => {
    const { container, mocks } = buildContainer({ order: baseOrder });

    await handleOrderPlaced({
      data: baseData,
      eventName: "order.payment_captured",
      container: container as any,
      pluginOptions: {},
    });

    expect(mocks.invoiceService.setOrderInvoiceNumber).toHaveBeenCalledWith(
      "ord_01",
    );
    expect(
      mocks.receiptNotificationService.sendNotification,
    ).toHaveBeenCalled();
  });

  it("skips invoice assignment when the order already has one", async () => {
    const { container, mocks } = buildContainer({
      order: {
        ...baseOrder,
        metadata: { invoice_number: "2026-00010" },
      },
    });

    await handleOrderPlaced({
      data: baseData,
      eventName: "order.payment_captured",
      container: container as any,
      pluginOptions: {},
    });

    expect(mocks.invoiceService.setOrderInvoiceNumber).not.toHaveBeenCalled();
    expect(
      mocks.receiptNotificationService.sendNotification,
    ).toHaveBeenCalled();
  });

  it("sends shipment invoice notification when the order is already shipped", async () => {
    const { container, mocks } = buildContainer({
      order: {
        ...baseOrder,
        fulfillment_status: "shipped",
      },
    });

    await handleOrderPlaced({
      data: baseData,
      eventName: "order.payment_captured",
      container: container as any,
      pluginOptions: {},
    });

    expect(mocks.invoiceService.setOrderInvoiceNumber).toHaveBeenCalledWith(
      "ord_01",
    );
    expect(
      mocks.shipmentNotificationService.sendInvoiceNotification,
    ).toHaveBeenCalled();
    expect(
      mocks.receiptNotificationService.sendNotification,
    ).not.toHaveBeenCalled();
  });
});
