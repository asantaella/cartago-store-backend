import ShipmentNotificationService from "../shipment-notification";

function buildService() {
  const service = new ShipmentNotificationService(
    {
      orderService: {},
      invoicePdfGeneratorService: {},
    } as any,
    {},
  );

  const order = {
    id: "ord_01",
    display_id: 1,
  } as any;

  const templateData = {
    display_id: 1,
    first_name: "Ana",
    customer: {
      first_name: "Ana",
    },
  } as any;

  const shipmentTemplateService = {
    getShipmentTemplateData: jest.fn().mockReturnValue({
      to_email: "ana@example.com",
      to_name: "Ana",
      data: templateData,
    }),
  };

  const sendTemplateEmail = jest.fn().mockResolvedValue(undefined);

  (service as any).shipmentTemplateService = shipmentTemplateService;
  (service as any).resolveShipmentContext = jest.fn().mockResolvedValue({
    order,
    fulfillment: undefined,
  });
  (service as any).buildTemplateData = jest.fn().mockReturnValue(templateData);
  (service as any).buildPDFAttachment = jest.fn().mockResolvedValue({
    content: "pdf-content",
    filename: "invoice.pdf",
  });
  (service as any).sendTemplateEmail = sendTemplateEmail;

  return {
    service,
    order,
    sendTemplateEmail,
  };
}

describe("ShipmentNotificationService.sendInvoiceNotification", () => {
  const originalAdminEmail = process.env.ADMIN_EMAIL;
  const originalMailersendAdminEmail = process.env.MAILERSEND_ADMIN_EMAIL;
  const originalSenderName = process.env.MAILERSEND_SENDER_NAME;

  beforeEach(() => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.MAILERSEND_ADMIN_EMAIL = "admin-fallback@example.com";
    process.env.MAILERSEND_SENDER_NAME = "Cartago4x4";
  });

  afterAll(() => {
    process.env.ADMIN_EMAIL = originalAdminEmail;
    process.env.MAILERSEND_ADMIN_EMAIL = originalMailersendAdminEmail;
    process.env.MAILERSEND_SENDER_NAME = originalSenderName;
  });

  it("sends only to the customer when requested", async () => {
    const { service, order, sendTemplateEmail } = buildService();

    const result = await service.sendInvoiceNotification(order, {
      toClient: true,
      toAdmin: false,
    });

    expect(sendTemplateEmail).toHaveBeenCalledTimes(1);
    expect(sendTemplateEmail).toHaveBeenCalledWith(
      "ana@example.com",
      "Ana",
      "invoice-created",
      expect.any(Object),
      ["invoice-created", "customer-notification"],
      {
        content: "pdf-content",
        filename: "invoice.pdf",
      },
    );
    expect(result).toEqual(
      expect.objectContaining({
        to: "ana@example.com",
        status: "sent",
      }),
    );
  });

  it("sends only to the admin when requested", async () => {
    const { service, order, sendTemplateEmail } = buildService();

    const result = await service.sendInvoiceNotification(order, {
      toClient: false,
      toAdmin: true,
    });

    expect(sendTemplateEmail).toHaveBeenCalledTimes(1);
    expect(sendTemplateEmail).toHaveBeenCalledWith(
      "admin@example.com",
      "Cartago4x4",
      "invoice-created",
      expect.any(Object),
      ["invoice-created", "admin-notification"],
      {
        content: "pdf-content",
        filename: "invoice.pdf",
      },
    );
    expect(result).toEqual(
      expect.objectContaining({
        to: "admin@example.com",
        status: "sent",
      }),
    );
  });

  it("preserves the default behavior of sending to both recipients", async () => {
    const { service, order, sendTemplateEmail } = buildService();

    const result = await service.sendInvoiceNotification(order);

    expect(sendTemplateEmail).toHaveBeenCalledTimes(2);
    expect(sendTemplateEmail).toHaveBeenNthCalledWith(
      1,
      "ana@example.com",
      "Ana",
      "invoice-created",
      expect.any(Object),
      ["invoice-created", "customer-notification"],
      {
        content: "pdf-content",
        filename: "invoice.pdf",
      },
    );
    expect(sendTemplateEmail).toHaveBeenNthCalledWith(
      2,
      "admin@example.com",
      "Cartago4x4",
      "invoice-created",
      expect.any(Object),
      ["invoice-created", "admin-notification"],
      {
        content: "pdf-content",
        filename: "invoice.pdf",
      },
    );
    expect(result).toEqual(
      expect.objectContaining({
        to: "admin@example.com",
        status: "sent",
      }),
    );
  });
});