import InvoiceNumberGeneratorService from "../invoice-number-generator";

const SINGLETON_ID = "invoice_global";

function makeService() {
  const mockRecord = { id: SINGLETON_ID, counter: 42, save: jest.fn() };

  const mockRepo = {
    findOne: jest.fn().mockResolvedValue(mockRecord),
    save: jest.fn().mockImplementation(async (r) => r),
  };

  const mockManager = {
    withRepository: jest.fn().mockReturnValue(mockRepo),
  };

  const mockOrderService = {
    retrieve: jest.fn().mockResolvedValue({
      id: "order_01",
      metadata: {},
    }),
    update: jest.fn().mockResolvedValue({}),
  };

  const container = {
    invoiceCounterRepository: mockRepo,
    orderService: mockOrderService,
    manager: mockManager,
  };

  const service = new InvoiceNumberGeneratorService(container as any);

  // Stub activeManager_ to return the mock manager
  Object.defineProperty(service, "activeManager_", { get: () => mockManager });

  // Stub atomicPhase_ to directly run the callback with the mock manager
  (service as any).atomicPhase_ = jest
    .fn()
    .mockImplementation((cb: any) => cb(mockManager));

  return { service, mockRepo, mockManager, mockOrderService, mockRecord };
}

describe("InvoiceNumberGeneratorService", () => {
  const currentYear = new Date().getFullYear();

  describe("getCounter", () => {
    it("returns the persisted counter value", async () => {
      const { service } = makeService();
      const result = await service.getCounter();
      expect(result).toBe(42);
    });

    it("throws if the singleton record is missing", async () => {
      const { service, mockRepo } = makeService();
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.getCounter()).rejects.toThrow(
        "Invoice counter singleton not found",
      );
    });
  });

  describe("setCounter", () => {
    it("writes the new counter value and returns it", async () => {
      const { service, mockRepo, mockRecord } = makeService();
      const result = await service.setCounter(99);
      expect(mockRecord.counter).toBe(99);
      expect(mockRepo.save).toHaveBeenCalledWith(mockRecord);
      expect(result).toBe(99);
    });

    it("throws if the singleton record is missing", async () => {
      const { service, mockRepo } = makeService();
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.setCounter(1)).rejects.toThrow(
        "Invoice counter singleton not found",
      );
    });
  });

  describe("getNextInvoiceNumber", () => {
    it("increments the counter and returns formatted invoice number", async () => {
      const { service, mockRecord } = makeService();
      const result = await service.getNextInvoiceNumber();
      expect(mockRecord.counter).toBe(43);
      expect(result).toBe(`${currentYear}-00043`);
    });

    it("uses pessimistic_write lock when reading the record", async () => {
      const { service, mockRepo } = makeService();
      await service.getNextInvoiceNumber();
      expect(mockRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          lock: { mode: "pessimistic_write" },
        }),
      );
    });

    it("pads counter to 5 digits", async () => {
      const { service, mockRecord } = makeService();
      mockRecord.counter = 99998;
      const result = await service.getNextInvoiceNumber();
      expect(result).toBe(`${currentYear}-99999`);
    });

    it("throws if the singleton record is missing", async () => {
      const { service, mockRepo } = makeService();
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.getNextInvoiceNumber()).rejects.toThrow(
        "Invoice counter singleton not found",
      );
    });
  });

  describe("setOrderInvoiceNumber", () => {
    it("assigns next invoice number to order metadata", async () => {
      const { service, mockOrderService, mockRecord } = makeService();
      const result = await service.setOrderInvoiceNumber("order_01");
      expect(mockOrderService.update).toHaveBeenCalledWith(
        "order_01",
        expect.objectContaining({
          metadata: expect.objectContaining({
            invoice_number: `${currentYear}-00043`,
          }),
        }),
      );
      expect(result).toBe(`${currentYear}-00043`);
    });

    it("skips assignment if invoice_number already set in metadata", async () => {
      const { service, mockOrderService } = makeService();
      mockOrderService.retrieve.mockResolvedValue({
        id: "order_01",
        metadata: { invoice_number: "2025-00010" },
      });
      const result = await service.setOrderInvoiceNumber("order_01");
      expect(mockOrderService.update).not.toHaveBeenCalled();
      expect(result).toBe("2025-00010");
    });
  });
});
