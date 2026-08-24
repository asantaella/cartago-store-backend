/// <reference types="jest" />

import ReceiptNotificationService from "../receipt-notification";
import { Order } from "@medusajs/medusa";

// ── Mock MailerSend ──────────────────────────────────────────────────────

const mockEmailSend = jest.fn().mockResolvedValue(true);

jest.mock("mailersend", () => {
  const mockRecipient = jest
    .fn()
    .mockImplementation((email, name) => ({ email, name }));
  const mockEmailParams = jest.fn().mockImplementation(() => {
    const chain: any = {};
    chain.setFrom = jest.fn().mockReturnValue(chain);
    chain.setTo = jest.fn().mockReturnValue(chain);
    chain.setTemplateId = jest.fn().mockReturnValue(chain);
    chain.setPersonalization = jest.fn().mockReturnValue(chain);
    chain.setAttachments = jest.fn().mockReturnValue(chain);
    return chain;
  });
  return {
    MailerSend: jest.fn().mockImplementation(() => ({
      email: { send: mockEmailSend },
    })),
    Recipient: mockRecipient,
    EmailParams: mockEmailParams,
  };
});

// ── Env ──────────────────────────────────────────────────────────────────

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.MAILERSEND_API_KEY = "test-api-key";
  process.env.MAILERSEND_SENDER_EMAIL = "sender@cartago4x4.es";
  process.env.MAILERSEND_SENDER_NAME = "Cartago 4x4";
  process.env.MAILERSEND_ORDER_PLACED_TEMPLATE_ID = "tmpl_placed";
  process.env.MAILERSEND_ADMIN_EMAIL = "admin@cartago4x4.es";
  process.env.MAILERSEND_COMPANY_NAME = "Cartago 4x4";
  process.env.MAILERSEND_ORDER_PLACED_URL = "https://cartago4x4.es/order";
  process.env.MAILERSEND_SUPPORT_URL = "https://cartago4x4.es/support";
  process.env.MAILERSEND_SENDER_ADDRESS = "Calle Loma Atlas 26";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  mockEmailSend.mockClear();
});

// ── Helpers ──────────────────────────────────────────────────────────────

function createMockOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order_01",
    display_id: 1001,
    email: "cliente@ejemplo.com",
    created_at: new Date("2025-06-15") as any,
    currency_code: "EUR",
    subtotal: 20000,
    shipping_total: 595,
    discount_total: 2000,
    tax_total: 3777,
    total: 22372,
    shipping_address: {
      first_name: "Juan",
      last_name: "Pérez",
      address_1: "Calle Mayor 10",
      address_2: "",
      city: "Madrid",
      province: "Madrid",
      postal_code: "28001",
      country_code: "ES",
      phone: "612345678",
      metadata: { nif_cif: "12345678Z" },
    } as any,
    billing_address: {
      first_name: "Empresa",
      last_name: "Cartago",
      address_1: "Calle Facturación 456",
      address_2: "",
      city: "Madrid",
      province: "Madrid",
      postal_code: "28002",
      country_code: "ES",
      phone: "600000000",
      metadata: { nif_cif: "B12345678" },
    } as any,
    items: [
      {
        id: "item_1",
        title: "Faro LED",
        quantity: 2,
        unit_price: 5000,
        variant: {
          id: "v_1",
          title: "Negro",
          sku: "LED-001",
          barcode: "1234567890123",
        },
        subtotal: 10000,
        discount_total: 1000,
        tax_total: 1889,
        total: 10889,
        tax_lines: [{ rate: 21 }],
      } as any,
    ],
    shipping_methods: [
      {
        id: "sm_1",
        shipping_option: { id: "so_1", name: "Envío Estándar" },
        price: 595,
        total: 595,
      } as any,
    ],
    region: { tax_rate: 21 } as any,
    ...overrides,
  } as unknown as Order;
}

// ── Container helper ─────────────────────────────────────────────────────

function buildContainer(): any {
  const orderServiceMock = {
    retrieveWithTotals: jest.fn(),
  };
  const orderCsvAttachmentServiceMock = {
    buildCSVAttachment: jest.fn().mockResolvedValue("base64csv"),
  };
  return {
    container: {
      orderService: orderServiceMock,
      orderCsvAttachmentService: orderCsvAttachmentServiceMock,
    },
    orderServiceMock,
    orderCsvAttachmentServiceMock,
  };
}

// ── Suite ────────────────────────────────────────────────────────────────

describe("ReceiptNotificationService", () => {
  let service: ReceiptNotificationService;
  let order: Order;
  let orderServiceMock: any;
  let orderCsvAttachmentServiceMock: any;

  beforeEach(() => {
    const ctx = buildContainer();
    orderServiceMock = ctx.orderServiceMock;
    orderCsvAttachmentServiceMock = ctx.orderCsvAttachmentServiceMock;

    service = new ReceiptNotificationService(ctx.container, {});
    order = createMockOrder();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────
  // sendNotification
  // ──────────────────────────────────────────────────────────────────────

  describe("sendNotification", () => {
    it("retrieves the order, builds template data, sends the email, and returns success", async () => {
      orderServiceMock.retrieveWithTotals.mockResolvedValue(order);

      const data: any = { id: "order_01", email: order.email };
      const result = await service.sendNotification("order.placed", data);

      expect(orderServiceMock.retrieveWithTotals).toHaveBeenCalledWith(
        "order_01",
        expect.objectContaining({ relations: expect.any(Array) }),
      );
      expect(result.status).toBe("sent");
      expect(mockEmailSend).toHaveBeenCalledTimes(2);
    });

    it("returns failed status when the order has no email", async () => {
      orderServiceMock.retrieveWithTotals.mockResolvedValue({
        ...order,
        email: "",
      });

      const result = await service.sendNotification("order.placed", {
        id: "order_02",
      } as Order);

      expect(result.status).toBe("failed");
    });

    it("returns failed status when retrieveWithTotals throws", async () => {
      orderServiceMock.retrieveWithTotals.mockRejectedValue(
        new Error("DB error"),
      );

      const result = await service.sendNotification("order.placed", {
        id: "order_03",
        email: "x@y.com",
      } as Order);

      expect(result.status).toBe("failed");
    });

    it("returns failed status when MailerSend throws", async () => {
      orderServiceMock.retrieveWithTotals.mockResolvedValue(order);
      mockEmailSend.mockRejectedValueOnce(new Error("SMTP error"));

      const result = await service.sendNotification("order.placed", {
        id: "order_01",
      } as Order);

      expect(result.status).toBe("failed");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // buildCSVAttachment
  // ──────────────────────────────────────────────────────────────────────

  describe("buildCSVAttachment", () => {
    it("delegates to orderCsvAttachmentService", async () => {
      orderCsvAttachmentServiceMock.buildCSVAttachment.mockResolvedValue(
        "base64csv",
      );

      const csv = await service.buildCSVAttachment(order);

      expect(orderCsvAttachmentServiceMock.buildCSVAttachment).toHaveBeenCalledWith(
        order,
      );
      expect(csv).toBe("base64csv");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // resendNotification
  // ──────────────────────────────────────────────────────────────────────

  describe("resendNotification", () => {
    it("re-sends when a new to_email is provided", async () => {
      orderServiceMock.retrieveWithTotals.mockResolvedValue(order);

      const result = await service.resendNotification(
        {
          to: "old@example.com",
          event_name: "order.placed",
          data: { id: "order_01" },
        },
        { to_email: "new@example.com" },
        undefined,
      );

      expect(result.status).toBe("sent");
    });

    it("returns done status when to_email is unchanged", async () => {
      const result = await service.resendNotification(
        { to: "x@y.com", data: {} },
        { to_email: "x@y.com" },
        undefined,
      );

      expect(result.status).toBe("done");
    });
  });
});
