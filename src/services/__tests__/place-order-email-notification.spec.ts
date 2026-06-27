import PlaceOrderEmailNotificationService from "../place-order-email-notification";

function buildService() {
  const order = {
    id: "order_01",
    display_id: 1234,
    email: "customer@example.com",
    shipping_address: { first_name: "Ana", last_name: "García" },
    items: [{ title: "Item 1", quantity: 1 }],
    currency_code: "EUR",
    created_at: new Date(),
  } as any;

  const getTemplateData = jest.fn().mockReturnValue({
    to_email: order.email,
    to_name: "Ana García",
    data: { display_id: order.display_id },
  });

  const sendEmailWithRetry = jest.fn().mockResolvedValue({
    messageId: "msg_01",
  });

  const buildEmailPayload = jest.fn().mockReturnValue({
    to: [{ email: "admin@example.com" }],
    subject: "Test",
    html: "<p>pedido</p>",
    tags: [],
  });

  const service = new PlaceOrderEmailNotificationService({
    orderService: {},
  } as any);

  (service as any).orderNotificationService = { getTemplateData };
  (service as any).renderOrderTemplate = jest
    .fn()
    .mockReturnValue("<p>pedido</p>");
  (service as any).sendEmailWithRetry = sendEmailWithRetry;
  (service as any).buildEmailPayload = buildEmailPayload;

  return { service, order, getTemplateData, sendEmailWithRetry, buildEmailPayload };
}

describe("PlaceOrderEmailNotificationService.sendEmailAdmin", () => {
  const originalAdminEmail = process.env.ADMIN_EMAIL;

  beforeAll(() => {
    process.env.ADMIN_EMAIL = "admin@example.com";
  });

  afterAll(() => {
    process.env.ADMIN_EMAIL = originalAdminEmail;
  });

  it("builds template data from the order and sends an admin notification", async () => {
    const { service, order, getTemplateData, sendEmailWithRetry, buildEmailPayload } = buildService();

    await service.sendEmailAdmin(order);

    // Should call getTemplateData on the notification service
    expect(getTemplateData).toHaveBeenCalledWith(order);

    // Should build the email payload with the admin email and a SEPA subject
    expect(buildEmailPayload).toHaveBeenCalledWith(
      "admin@example.com",
      expect.stringContaining("1234"),
      "<p>pedido</p>",
      expect.arrayContaining(["sepa-direct-debit"]),
    );

    // Should send via sendEmailWithRetry
    expect(sendEmailWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [{ email: "admin@example.com" }],
      }),
      expect.stringContaining("1234"),
    );
  });

  it("returns early when no admin email is configured", async () => {
    delete process.env.ADMIN_EMAIL;

    const { service, order, getTemplateData, sendEmailWithRetry } = buildService();

    await service.sendEmailAdmin(order);

    expect(getTemplateData).not.toHaveBeenCalled();
    expect(sendEmailWithRetry).not.toHaveBeenCalled();

    process.env.ADMIN_EMAIL = "admin@example.com";
  });
});