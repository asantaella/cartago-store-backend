jest.mock("pdfmake", () => jest.fn());

import pdfmake from "pdfmake";
import InvoicePdfGeneratorService from "../invoice-pdf-generator";

const mockedPdfmake = jest.mocked(pdfmake);

describe("InvoicePdfGeneratorService", () => {
  let order: any;
  let pdfDefinition: any;
  let service: InvoicePdfGeneratorService;

  beforeEach(() => {
    order = {
      display_id: 123,
      metadata: { invoice_number: "2026-00123" },
      billing_address: {
        address_1: "1 Main Street",
        city: "Cartagena",
        country_code: "es",
        metadata: {
          order_taxes_total: 5.6,
          order_total: 10.275,
        },
        postal_code: "30205",
        province: "Murcia",
      },
      shipping_address: {
        first_name: "Ada",
        last_name: "Lovelace",
        metadata: {},
      },
      items: [
        {
          includes_tax: false,
          quantity: 1,
          subtotal: 10000,
          tax_total: 2100,
          tax_lines: [{ rate: 21 }],
          title: "Test item",
          variant: { product: { categories: [] } },
        },
      ],
      shipping_total: 0,
      subtotal: 10000,
      tax_total: 2100,
      total: 12345,
      discount_total: 0,
      gift_card_total: 0,
      refunded_total: 0,
      payments: [],
    };

    const handlers: Record<string, (chunk?: Buffer) => void> = {};
    const pdfDocument: any = {
      on: jest.fn((event: string, callback: (chunk?: Buffer) => void) => {
        handlers[event] = callback;
        return pdfDocument;
      }),
      end: jest.fn(() => {
        handlers.data(Buffer.from("pdf"));
        handlers.end();
      }),
    };

    (mockedPdfmake as jest.Mock).mockImplementation(
      () =>
        ({
          createPdfKitDocument: jest.fn((definition: any) => {
            pdfDefinition = definition;
            return pdfDocument;
          }),
        }) as any,
    );

    service = new InvoicePdfGeneratorService({
      orderService: { retrieveWithTotals: jest.fn().mockResolvedValue(order) },
      invoiceNumberGeneratorService: {
        getCounter: jest.fn().mockResolvedValue(1),
        formatInvoiceNumber: jest.fn().mockReturnValue("2026-00002"),
      },
    } as any);
  });

  it("uses billing metadata amounts as display-unit values with two decimals", async () => {
    await service.generateInvoice("order_123");

    const summaryRows = pdfDefinition.content[0].table.body[1][0].stack[1].table
      .body;
    const taxesRow = summaryRows.find((row: any[]) =>
      row[0].text.startsWith("IVA "),
    );
    const totalRow = summaryRows.find((row: any[]) => row[0].text === "TOTAL:");

    expect(taxesRow[1].text).toBe("€5.60");
    expect(totalRow[1].text).toBe("€10.28");
    expect(summaryRows[0][1].text).toBe("€100.00");
    const shippingRow = summaryRows.find(
      (row: any[]) => row[0].text === "ENVÍO:",
    );
    expect(shippingRow[1].text).toBe("€0.00");
  });

  it("converts decimal string metadata to numbers rounded to two decimals", async () => {
    order.billing_address.metadata.order_taxes_total = "5.678";
    order.billing_address.metadata.order_total = "10.276";

    await service.generateInvoice("order_123");

    const summaryRows = pdfDefinition.content[0].table.body[1][0].stack[1].table
      .body;
    const taxesRow = summaryRows.find((row: any[]) =>
      row[0].text.startsWith("IVA "),
    );
    const totalRow = summaryRows.find((row: any[]) => row[0].text === "TOTAL:");

    expect(taxesRow[1].text).toBe("€5.68");
    expect(totalRow[1].text).toBe("€10.28");
  });

  it("keeps a zero tax override and falls back to the calculated total when total is null", async () => {
    order.billing_address.metadata.order_taxes_total = 0;
    order.billing_address.metadata.order_total = null;

    await service.generateInvoice("order_123");

    const summaryRows = pdfDefinition.content[0].table.body[1][0].stack[1].table
      .body;
    const taxesRow = summaryRows.find((row: any[]) =>
      row[0].text.startsWith("IVA "),
    );
    const totalRow = summaryRows.find((row: any[]) => row[0].text === "TOTAL:");

    expect(taxesRow[1].text).toBe("€0.00");
    expect(totalRow[1].text).toBe("€121.00");
  });

  it("falls back for missing tax metadata while keeping a zero total override", async () => {
    delete order.billing_address.metadata.order_taxes_total;
    order.billing_address.metadata.order_total = 0;

    await service.generateInvoice("order_123");

    const summaryRows = pdfDefinition.content[0].table.body[1][0].stack[1].table
      .body;
    const taxesRow = summaryRows.find((row: any[]) =>
      row[0].text.startsWith("IVA "),
    );
    const totalRow = summaryRows.find((row: any[]) => row[0].text === "TOTAL:");

    expect(taxesRow[1].text).toBe("€21.00");
    expect(totalRow[1].text).toBe("€0.00");
  });

  it("falls back when metadata amounts are null or missing", async () => {
    order.billing_address.metadata.order_taxes_total = null;
    delete order.billing_address.metadata.order_total;

    await service.generateInvoice("order_123");

    const summaryRows = pdfDefinition.content[0].table.body[1][0].stack[1].table
      .body;
    const taxesRow = summaryRows.find((row: any[]) =>
      row[0].text.startsWith("IVA "),
    );
    const totalRow = summaryRows.find((row: any[]) => row[0].text === "TOTAL:");

    expect(taxesRow[1].text).toBe("€21.00");
    expect(totalRow[1].text).toBe("€121.00");
  });

  it.each([
    ["order_taxes_total", "5.60junk"],
    ["order_taxes_total", ""],
    ["order_taxes_total", Number.POSITIVE_INFINITY],
    ["order_total", "NaN"],
    ["order_total", "Infinity"],
    ["order_total", Number.NaN],
  ])("rejects invalid billing metadata amount %s", async (key, value) => {
    order.billing_address.metadata[key] = value;

    await expect(service.generateInvoice("order_123")).rejects.toThrow(
      `Invalid billing address metadata ${key}: expected a finite number`,
    );
  });
});
