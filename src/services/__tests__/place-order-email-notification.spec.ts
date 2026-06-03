import PlaceOrderEmailNotificationService from "../place-order-email-notification";

function buildService() {
  const service = new PlaceOrderEmailNotificationService({
    orderService: {},
    orderCsvAttachmentService: {},
  } as any);

  const order = {
    id: "order_01",
    display_id: 1234,
    email: "customer@example.com",
  } as any;

  const hydratedOrder = {
    ...order,
    items: [],
    shipping_methods: [],
  } as any;

  const sendEmailWithRetry = jest.fn().mockResolvedValue({
    messageId: "msg_01",
  });
  const retrieveOrderWithRelations = jest.fn().mockResolvedValue(hydratedOrder);
  const buildCSVAttachment = jest.fn().mockResolvedValue("csv-base64");

  (service as any).orderNotificationService = {
    retrieveOrderWithRelations,
  };
  (service as any).orderCsvAttachmentService = {
    buildCSVAttachment,
  };
  (service as any).buildTemplateData = jest.fn().mockReturnValue({
    toEmail: order.email,
    toName: "Ana",
    templateData: {
      display_id: hydratedOrder.display_id,
    },
  });
  (service as any).renderOrderTemplate = jest.fn().mockReturnValue(
    "<p>pedido</p>",
  );
  (service as any).sendEmailWithRetry = sendEmailWithRetry;

  return {
    service,
    order,
    hydratedOrder,
    retrieveOrderWithRelations,
    buildCSVAttachment,
    sendEmailWithRetry,
  };
}

describe("PlaceOrderEmailNotificationService.sendEmailAdmin", () => {
  const originalAdminEmail = process.env.ADMIN_EMAIL;
  const originalMailersendAdminEmail = process.env.MAILERSEND_ADMIN_EMAIL;

  beforeEach(() => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.MAILERSEND_ADMIN_EMAIL = "fallback-admin@example.com";
  });

  afterAll(() => {
    process.env.ADMIN_EMAIL = originalAdminEmail;
    process.env.MAILERSEND_ADMIN_EMAIL = originalMailersendAdminEmail;
  });

  it("attaches the shared CSV to the admin email", async () => {
    const {
      service,
      order,
      hydratedOrder,
      retrieveOrderWithRelations,
      buildCSVAttachment,
      sendEmailWithRetry,
    } = buildService();

    await service.sendEmailAdmin(order);

    expect(retrieveOrderWithRelations).toHaveBeenCalledWith(order.id, [
      "payments",
      "customer",
      "gift_cards",
      "items.tax_lines",
    ]);
    expect(buildCSVAttachment).toHaveBeenCalledWith(hydratedOrder);
    expect(sendEmailWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [{ email: "admin@example.com", name: undefined }],
        attachment: [
          {
            content: "csv-base64",
            name: `Cartago4x4_invoice_${hydratedOrder.display_id}.csv`,
          },
        ],
      }),
      `Order placed SEPA admin notification for order ${hydratedOrder.display_id}`,
    );
  });
});