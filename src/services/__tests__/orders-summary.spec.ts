import OrdersSummaryService from "../orders-summary";

function makeService(overrides: Record<string, unknown> = {}) {
  const mockRecord = {
    id: "invoice_global",
    counter: 0,
    last_summary_sent_date: null as string | null,
  };

  const mockRepo = {
    findOne: jest.fn().mockResolvedValue(mockRecord),
    save: jest.fn().mockImplementation(async (r) => r),
  };

  const mockManager = {
    withRepository: jest.fn().mockReturnValue(mockRepo),
  };

  const mockOrderService = {
    listAndCount: jest.fn(),
  };

  const container = {
    invoiceCounterRepository: mockRepo,
    manager: mockManager,
    orderService: mockOrderService,
    ...overrides,
  };

  const service = new OrdersSummaryService(container as any);

  Object.defineProperty(service, "activeManager_", {
    get: () => mockManager,
  });

  (service as any).atomicPhase_ = jest
    .fn()
    .mockImplementation((cb: any) => cb(mockManager));

  return { service, mockRepo, mockManager, mockOrderService, mockRecord };
}

describe("OrdersSummaryService", () => {
  describe("getSpainDateString", () => {
    it("returns date in Europe/Madrid timezone", () => {
      const { service } = makeService();
      const result = service.getSpainDateString(
        new Date("2026-05-09T22:30:00Z"),
      );
      expect(result).toBe("2026-05-10");
    });

    it("returns same UTC date when Madrid is still the same day", () => {
      const { service } = makeService();
      const result = service.getSpainDateString(
        new Date("2026-01-01T22:30:00Z"),
      );
      expect(result).toBe("2026-01-01");
    });
  });

  describe("getSpainDayBoundsUtc", () => {
    it("returns correct UTC bounds for a summer day (UTC+2)", () => {
      const { service } = makeService();
      const { start, end } = service.getSpainDayBoundsUtc("2026-07-15");
      expect(start.toISOString()).toBe("2026-07-14T22:00:00.000Z");
      expect(end.toISOString()).toBe("2026-07-15T22:00:00.000Z");
    });

    it("returns correct UTC bounds for a winter day (UTC+1)", () => {
      const { service } = makeService();
      const { start, end } = service.getSpainDayBoundsUtc("2026-01-15");
      expect(start.toISOString()).toBe("2026-01-14T23:00:00.000Z");
      expect(end.toISOString()).toBe("2026-01-15T23:00:00.000Z");
    });
  });

  describe("wasSummaryAlreadySent", () => {
    it("returns false when last_summary_sent_date is null", async () => {
      const { service, mockRecord } = makeService();
      mockRecord.last_summary_sent_date = null;
      expect(await service.wasSummaryAlreadySent("2026-05-09")).toBe(false);
    });

    it("returns true when last_summary_sent_date matches", async () => {
      const { service, mockRecord } = makeService();
      mockRecord.last_summary_sent_date = "2026-05-09";
      expect(await service.wasSummaryAlreadySent("2026-05-09")).toBe(true);
    });

    it("returns false when last_summary_sent_date is a different date", async () => {
      const { service, mockRecord } = makeService();
      mockRecord.last_summary_sent_date = "2026-05-08";
      expect(await service.wasSummaryAlreadySent("2026-05-09")).toBe(false);
    });
  });

  describe("markSummaryAsSent", () => {
    it("persists the Spain date to last_summary_sent_date", async () => {
      const { service, mockRecord } = makeService();
      await service.markSummaryAsSent("2026-05-09");
      expect(mockRecord.last_summary_sent_date).toBe("2026-05-09");
    });
  });

  describe("queryOrdersForDateRange", () => {
    it("deduplicates orders appearing in both created and shipped results", async () => {
      const { service, mockOrderService } = makeService();
      const sharedOrder = {
        id: "ord_01",
        display_id: 1,
        total: 10000,
        tax_total: 2100,
        status: "completed",
        fulfillment_status: "shipped",
        fulfillment: null,
        fulfillments: [{ shipped_at: "2026-05-09T10:00:00Z" }],
        metadata: { invoice_number: "2026-00001" },
        created_at: "2026-05-09T10:00:00Z",
        email: "test@example.com",
        customer: { email: "test@example.com" },
      };
      mockOrderService.listAndCount
        .mockResolvedValueOnce([[sharedOrder], 1])
        .mockResolvedValueOnce([[sharedOrder], 1]);

      const { rows, totals } =
        await service.queryOrdersForDateRange("2026-05-09");
      expect(rows).toHaveLength(1);
      expect(rows[0].invoice_number).toBe("2026-00001");
      expect(totals.total_orders).toBe(1);
    });

    it("marks invoice_number as Pendiente when not set in metadata", async () => {
      const { service, mockOrderService } = makeService();
      mockOrderService.listAndCount
        .mockResolvedValueOnce([
          [
            {
              id: "ord_02",
              display_id: 2,
              total: 5000,
              tax_total: 1050,
              status: "pending",
              payment_status: "awaiting",
              fulfillment_status: "not_fulfilled",
              fulfillments: [],
              metadata: {},
              created_at: "2026-05-09T14:00:00Z",
              email: "buyer@example.com",
              customer: { email: "buyer@example.com" },
            },
          ],
          1,
        ])
        .mockResolvedValueOnce([[], 0]);

      const { rows } = await service.queryOrdersForDateRange("2026-05-09");
      expect(rows[0].invoice_number).toBe("-");
      expect(rows[0].status_label).toBe("Pendiente");
    });

    it("shows Pagado when the order is captured but not shipped", async () => {
      const { service, mockOrderService } = makeService();
      mockOrderService.listAndCount
        .mockResolvedValueOnce([
          [
            {
              id: "ord_05",
              display_id: 5,
              total: 1000,
              tax_total: 210,
              status: "completed",
              payment_status: "captured",
              fulfillment_status: "not_fulfilled",
              fulfillments: [],
              metadata: {},
              created_at: "2026-05-09T12:00:00Z",
              email: "paid@example.com",
              customer: { email: "paid@example.com" },
            },
          ],
          1,
        ])
        .mockResolvedValueOnce([[], 0]);

      const { rows } = await service.queryOrdersForDateRange("2026-05-09");
      expect(rows[0].status_label).toBe("Pagado");
    });

    it("shows Enviado when the order is shipped", async () => {
      const { service, mockOrderService } = makeService();
      mockOrderService.listAndCount
        .mockResolvedValueOnce([
          [
            {
              id: "ord_06",
              display_id: 6,
              total: 1000,
              tax_total: 210,
              status: "completed",
              payment_status: "captured",
              fulfillment_status: "shipped",
              fulfillments: [{ shipped_at: "2026-05-09T12:00:00Z" }],
              metadata: {},
              created_at: "2026-05-09T12:00:00Z",
              email: "shipped@example.com",
              customer: { email: "shipped@example.com" },
            },
          ],
          1,
        ])
        .mockResolvedValueOnce([[], 0]);

      const { rows } = await service.queryOrdersForDateRange("2026-05-09");
      expect(rows[0].status_label).toBe("Enviado");
    });

    it("returns rows sorted by order_number descending", async () => {
      const { service, mockOrderService } = makeService();
      const base = {
        total: 1000,
        tax_total: 210,
        status: "completed",
        fulfillment_status: "not_fulfilled",
        fulfillments: [],
        metadata: {},
        created_at: "2026-05-09T12:00:00Z",
        email: "c@c.com",
        customer: { email: "c@c.com" },
      };
      const o3 = { ...base, id: "ord_03", display_id: 3 };
      const o1 = { ...base, id: "ord_01", display_id: 1 };
      const o2 = { ...base, id: "ord_02", display_id: 2 };
      mockOrderService.listAndCount
        .mockResolvedValueOnce([[o3, o1], 2])
        .mockResolvedValueOnce([[o2], 1]);

      const { rows } = await service.queryOrdersForDateRange("2026-05-09");
      expect(rows.map((r) => r.order_number)).toEqual([3, 2, 1]);
    });

    it("includes orders shipped in the selected range even if they were created earlier", async () => {
      const { service, mockOrderService } = makeService();
      mockOrderService.listAndCount
        .mockResolvedValueOnce([[], 0])
        .mockResolvedValueOnce([
          [
            {
              id: "ord_10",
              display_id: 10,
              total: 2500,
              tax_total: 525,
              status: "completed",
              fulfillment_status: "shipped",
              fulfillments: [{ shipped_at: "2026-05-07T21:30:00Z" }],
              metadata: {},
              created_at: "2026-05-01T08:00:00Z",
              email: "shipped@example.com",
              customer: { email: "shipped@example.com" },
            },
          ],
          1,
        ]);

      const { rows } = await service.queryOrdersForDateRange(
        "2026-05-07",
        "2026-05-07",
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].order_number).toBe(10);
    });
  });

  describe("runScheduledDaily – idempotency", () => {
    it("skips sending if already sent today", async () => {
      const { service, mockRecord } = makeService();
      const spainDate = service.getSpainDateString(new Date());
      mockRecord.last_summary_sent_date = spainDate;

      const sendSpy = jest
        .spyOn(service, "sendSummaryEmail")
        .mockResolvedValue();

      await service.runScheduledDaily(new Date());
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("sends and marks when not yet sent today", async () => {
      const { service, mockRecord } = makeService();
      mockRecord.last_summary_sent_date = null;

      const sendSpy = jest
        .spyOn(service, "sendSummaryEmail")
        .mockResolvedValue();
      const markSpy = jest
        .spyOn(service, "markSummaryAsSent")
        .mockResolvedValue();
      jest.spyOn(service, "queryOrdersForDateRange").mockResolvedValue({
        rows: [],
        totals: { total_orders: 0, gross_total: "0.00 €", net_total: "0.00 €" },
      });

      await service.runScheduledDaily(new Date());
      expect(sendSpy).toHaveBeenCalled();
      expect(markSpy).toHaveBeenCalled();
    });
  });

  describe("generateOrdersSummary", () => {
    it("sends email without checking idempotency even if already sent", async () => {
      const { service, mockRecord } = makeService();
      mockRecord.last_summary_sent_date = "2026-05-09";

      const querySpy = jest
        .spyOn(service, "queryOrdersForDateRange")
        .mockResolvedValue({
          rows: [],
          totals: {
            total_orders: 0,
            gross_total: "0.00 €",
            net_total: "0.00 €",
          },
        });
      const sendSpy = jest
        .spyOn(service, "sendSummaryEmail")
        .mockResolvedValue();

      await service.generateOrdersSummary("2026-05-09");
      expect(querySpy).toHaveBeenCalledWith("2026-05-09", "2026-05-09");
      expect(sendSpy).toHaveBeenCalled();
    });

    it("passes explicit date range to queryOrdersForDateRange", async () => {
      const { service } = makeService();
      const querySpy = jest
        .spyOn(service, "queryOrdersForDateRange")
        .mockResolvedValue({
          rows: [],
          totals: {
            total_orders: 0,
            gross_total: "0.00 €",
            net_total: "0.00 €",
          },
        });
      jest.spyOn(service, "sendSummaryEmail").mockResolvedValue();

      await service.generateOrdersSummary("2026-05-01", "2026-05-07");
      expect(querySpy).toHaveBeenCalledWith("2026-05-01", "2026-05-07");
    });
  });
});
