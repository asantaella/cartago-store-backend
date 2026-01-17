import OrderInvoiceService from "../order-invoice";
import { Order } from "@medusajs/medusa";

describe("OrderInvoiceService", () => {
  let invoiceNumberGenerator: OrderInvoiceService;
  let mockOrderService: any;

  beforeEach(() => {
    mockOrderService = {
      retrieve: jest.fn(),
      update: jest.fn(),
    };

    invoiceNumberGenerator = new OrderInvoiceService({
      orderService: mockOrderService,
    });
  });

  describe("getInvoiceNumber", () => {
    it("should generate invoice number correctly", async () => {
      const order = {
        display_id: 1,
      } as Order;

      // Mock environment variable
      process.env.INVOICE_START_REF = "100";

      // Mock listAndCount para devolver 1 orden pagada
      mockOrderService.listAndCount = jest.fn().mockResolvedValue([[order], 1]);

      const result = await invoiceNumberGenerator.getInvoiceNumber(order);
      const currentYear = new Date().getFullYear();
      const expectedInvoiceNumber = `${currentYear}-00101`;

      expect(result).toBe(expectedInvoiceNumber);
    });

    it("should return undefined for order without display_id", async () => {
      const order = {} as Order;

      const result = await invoiceNumberGenerator.getInvoiceNumber(order);

      expect(result).toBeUndefined();
    });

    it("should return undefined for null order", async () => {
      const result = await invoiceNumberGenerator.getInvoiceNumber(null);

      expect(result).toBeUndefined();
    });

    it("should handle missing INVOICE_START_REF environment variable", async () => {
      delete process.env.INVOICE_START_REF;

      const order = {
        display_id: 1,
      } as Order;

      const result = await invoiceNumberGenerator.getInvoiceNumber(order);
      const currentYear = new Date().getFullYear();
      const expectedInvoiceNumber = `${currentYear}-00101`;

      expect(result).toBeUndefined();
    });
  });

  describe("setOrderInvoiceNumber", () => {
    it("should set invoice number in order metadata", async () => {
      const orderId = "order_123";
      const order = {
        id: orderId,
        display_id: 1,
        metadata: { existing: "data" },
      } as Partial<Order>;

      const updatedOrder = {
        ...order,
        metadata: {
          existing: "data",
          invoice_number: "2025-00101",
        },
      };

      mockOrderService.retrieve.mockResolvedValue(order);
      mockOrderService.update.mockResolvedValue(updatedOrder);

      process.env.INVOICE_START_REF = "10000";

      const result =
        await invoiceNumberGenerator.setOrderInvoiceNumber(orderId);

      expect(mockOrderService.retrieve).toHaveBeenCalledWith(orderId, {
        relations: ["items", "customer", "shipping_address", "billing_address"],
      });

      expect(mockOrderService.update).toHaveBeenCalledWith(orderId, {
        metadata: {
          existing: "data",
          invoice_number: "2025-10001",
        },
      });

      expect(result).toBe(updatedOrder);
    });

    it("should throw error if invoice number cannot be generated", async () => {
      const orderId = "order_123";
      const order = {
        id: orderId,
        // No display_id
      } as Order;

      mockOrderService.retrieve.mockResolvedValue(order);

      await expect(
        invoiceNumberGenerator.setOrderInvoiceNumber(orderId),
      ).rejects.toThrow(
        "No se pudo generar el número de factura para el pedido",
      );
    });
  });
});
