import {
  FulfillmentStatus,
  Order,
  OrderService,
  PaymentStatus,
  TransactionBaseService,
} from "@medusajs/medusa";
import { EntityManager } from "typeorm";
import InvoiceCounterRepository from "../repositories/invoice-counter";
import EmailTemplateCompiler from "./email-template-compiler";

const SINGLETON_ID = "invoice_global";
const MADRID_TZ = "Europe/Madrid";

type InjectedDependencies = {
  manager: EntityManager;
  invoiceCounterRepository: typeof InvoiceCounterRepository;
  orderService: OrderService;
};

export type OrderSummaryRow = {
  order_number: number;
  invoice_number: string;
  invoice_date: string;
  total: string;
  tax_total: string;
  customer_email: string;
  created_at: string;
  status: string;
  status_label: string;
};

type OrderSummaryTotals = {
  total_orders: number;
  gross_total: string;
  net_total: string;
};

/**
 * Builds and sends order summary emails.
 * Supports arbitrary date ranges and is called both by the scheduled job
 * and the on-demand admin endpoint.
 */
class OrdersSummaryService extends TransactionBaseService {
  protected invoiceCounterRepository_: typeof InvoiceCounterRepository;
  protected orderService_: OrderService;

  constructor({
    invoiceCounterRepository,
    orderService,
  }: InjectedDependencies) {
    super(arguments[0]);
    this.invoiceCounterRepository_ = invoiceCounterRepository;
    this.orderService_ = orderService;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Time helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Returns today's date string in Spain time (YYYY-MM-DD).
   */
  getSpainDateString(now: Date = new Date()): string {
    return now
      .toLocaleDateString("sv-SE", { timeZone: MADRID_TZ })
      .slice(0, 10);
  }

  /**
   * Returns the UTC start and end of the given Spain calendar day.
   * Handles DST correctly via the Intl offset trick.
   */
  getSpainDayBoundsUtc(spainDate: string): { start: Date; end: Date } {
    const offsetMs = this.getMadridUtcOffsetMs(spainDate);
    const dateParts = spainDate.split("-").map(Number);
    const midnightUtcBase = Date.UTC(
      dateParts[0],
      dateParts[1] - 1,
      dateParts[2],
      0,
      0,
      0,
      0,
    );
    const start = new Date(midnightUtcBase - offsetMs);
    const end = new Date(midnightUtcBase - offsetMs + 24 * 60 * 60 * 1000);
    return { start, end };
  }

  /**
   * Returns the Madrid UTC offset in milliseconds for the given Spain date.
   * Uses noon UTC on that date (DST is stable at noon).
   */
  private getMadridUtcOffsetMs(spainDate: string): number {
    const testUtc = new Date(`${spainDate}T12:00:00Z`);
    const madridStr = testUtc.toLocaleString("en-CA", {
      timeZone: MADRID_TZ,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    // madridStr is like "2026-05-09, 14:00:00"
    const timePart = madridStr.replace(",", "").trim().split(/\s+/)[1];
    const [h, m, s] = timePart.split(":").map(Number);
    const madridHour = h + m / 60 + s / 3600;
    const offsetHours = madridHour - 12; // UTC was 12:00
    return offsetHours * 3600 * 1000;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Idempotency marker (used only by the scheduled job)
  // ──────────────────────────────────────────────────────────────────────────

  async wasSummaryAlreadySent(spainDate: string): Promise<boolean> {
    const repo = this.activeManager_.withRepository(
      this.invoiceCounterRepository_,
    );
    const record = await repo.findOne({ where: { id: SINGLETON_ID } });
    return record?.last_summary_sent_date === spainDate;
  }

  async markSummaryAsSent(spainDate: string): Promise<void> {
    await this.atomicPhase_(async (transactionManager: EntityManager) => {
      const repo = transactionManager.withRepository(
        this.invoiceCounterRepository_,
      );
      const record = await repo.findOne({ where: { id: SINGLETON_ID } });
      if (!record) return;
      record.last_summary_sent_date = spainDate;
      await repo.save(record);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Order query
  // ──────────────────────────────────────────────────────────────────────────

  private statusLabel(order: Order): string {
    if (order.fulfillment_status === FulfillmentStatus.SHIPPED) {
      return "Enviado";
    }

    if (order.payment_status === PaymentStatus.CAPTURED) {
      return "Pagado";
    }

    return "Pendiente";
  }

  private buildSummaryTotals(orders: Order[]): OrderSummaryTotals {
    const totals = orders.reduce(
      (accumulator, order) => {
        const totalCents = Number(order.total ?? 0);
        const taxCents = Number(order.tax_total ?? 0);

        accumulator.netCents += totalCents;
        accumulator.taxCents += taxCents;

        return accumulator;
      },
      { netCents: 0, taxCents: 0 },
    );

    const grossCents = totals.netCents - totals.taxCents;

    return {
      total_orders: orders.length,
      net_total: `${(totals.netCents / 100).toFixed(2)} €`,
      gross_total: `${(grossCents / 100).toFixed(2)} €`,
    };
  }

  private orderToSummaryRow(order: Order): OrderSummaryRow {
    const meta = (order.metadata as Record<string, unknown> | null) ?? {};
    const totalCents = Number(order.total ?? 0);
    const taxCents = Number(order.tax_total ?? 0);
    const totalEur = (totalCents / 100).toFixed(2);
    const taxEur = (taxCents / 100).toFixed(2);
    const invoiceNumber = meta["invoice_number"]
      ? String(meta["invoice_number"])
      : "-";
    const invoiceDate =
      order.payments &&
      order.payments.length > 0 &&
      order.payments[0].created_at
        ? new Date(order.payments[0].created_at).toLocaleDateString("es-ES", {
            timeZone: MADRID_TZ,
          })
        : "-";

    return {
      order_number: order.display_id as number,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      total: `${totalEur} €`,
      tax_total: `${taxEur} €`,
      customer_email: order.email ?? order.customer?.email ?? "",
      created_at: new Date(order.created_at).toLocaleDateString("es-ES", {
        timeZone: MADRID_TZ,
      }),
      status: (order.status as string) ?? "",
      status_label: this.statusLabel(order),
    };
  }

  private orderWasShippedInRange(
    order: Order,
    start: Date,
    end: Date,
  ): boolean {
    if (order.fulfillment_status !== FulfillmentStatus.SHIPPED) {
      return false;
    }

    return Array.isArray(order.fulfillments)
      ? order.fulfillments.some((fulfillment) => {
          if (!fulfillment.shipped_at) {
            return false;
          }

          const shippedAt = new Date(fulfillment.shipped_at);
          return shippedAt >= start && shippedAt < end;
        })
      : false;
  }

  /**
   * Queries orders created or shipped within the given Spain-time date range
   * (both dates inclusive), deduplicates by order id, and returns sorted rows.
   *
   * @param startDate - Start Spain-time date string (YYYY-MM-DD), inclusive.
   * @param endDate   - End Spain-time date string (YYYY-MM-DD), inclusive.
   *                    Defaults to startDate (single-day range).
   */
  async queryOrdersForDateRange(
    startDate: string,
    endDate: string = startDate,
  ): Promise<{ rows: OrderSummaryRow[]; totals: OrderSummaryTotals }> {
    const { start } = this.getSpainDayBoundsUtc(startDate);
    const { end } = this.getSpainDayBoundsUtc(endDate);

    const [createdOrders] = await this.orderService_.listAndCount(
      {
        created_at: {
          gte: start,
          lt: end,
        },
      } as Record<string, unknown>,
      {
        relations: ["customer", "fulfillments"],
      },
    );

    const [shippedOrders] = await this.orderService_.listAndCount(
      {
        fulfillment_status: FulfillmentStatus.SHIPPED,
      } as Record<string, unknown>,
      {
        relations: ["customer", "fulfillments"],
      },
    );

    const totals = this.buildSummaryTotals(createdOrders);

    // Merge and deduplicate by order id
    const seen = new Set<string>();
    const allRows: OrderSummaryRow[] = [];

    for (const order of [...createdOrders, ...shippedOrders]) {
      if ((order.status as string) === "canceled") {
        continue;
      }

      const createdInRange = new Date(order.created_at) >= start;
      const shippedInRange = this.orderWasShippedInRange(order, start, end);

      if (!createdInRange && !shippedInRange) {
        continue;
      }

      const id = order.id as string;
      if (seen.has(id)) continue;
      seen.add(id);

      allRows.push(this.orderToSummaryRow(order));
    }

    return {
      rows: allRows.sort((a, b) => b.order_number - a.order_number),
      totals,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Email
  // ──────────────────────────────────────────────────────────────────────────

  async sendSummaryEmail(
    startDate: string,
    endDate: string,
    rows: OrderSummaryRow[],
    totals: OrderSummaryTotals,
  ): Promise<void> {
    const adminEmail = process.env.MAILERSEND_ADMIN_EMAIL;
    if (!adminEmail) {
      throw new Error("MAILERSEND_ADMIN_EMAIL is not configured");
    }

    const dateLabel =
      startDate === endDate ? startDate : `${startDate} – ${endDate}`;

    const html = EmailTemplateCompiler.renderTemplate("daily-invoice-summary", {
      date: dateLabel,
      rows,
      has_rows: rows.length > 0,
      total_orders: totals.total_orders,
      gross_total: totals.gross_total,
      net_total: totals.net_total,
    });

    if (!html) {
      throw new Error("daily-invoice-summary template could not be rendered");
    }

    const brevoApiKey = process.env.BREVO_API_KEY;
    if (!brevoApiKey) {
      throw new Error("BREVO_API_KEY is not configured");
    }

    const payload = {
      sender: {
        email: process.env.SMTP_FROM ?? "equipo@cartago4x4.es",
        name: process.env.SMTP_SENDER ?? "Cartago4x4",
      },
      to: [{ email: adminEmail }],
      subject: `Resumen de pedidos – ${dateLabel}`,
      htmlContent: html,
      tags: ["orders-summary"],
    };

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": brevoApiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brevo API error (${response.status}): ${errorText}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Main entry points
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Queries orders for the given Spain-time date range and sends the summary
   * email. Does not check or update the idempotency marker – callers are
   * responsible for that if needed.
   *
   * @param startDate - Spain-time date string (YYYY-MM-DD), inclusive.
   * @param endDate   - Spain-time date string (YYYY-MM-DD), inclusive.
   *                    Defaults to startDate (single-day query).
   */
  async generateOrdersSummary(
    startDate: string,
    endDate: string = startDate,
  ): Promise<void> {
    const { rows, totals } = await this.queryOrdersForDateRange(
      startDate,
      endDate,
    );

    const dateLabel =
      startDate === endDate ? startDate : `${startDate} – ${endDate}`;

    console.log(
      `[ORDERS-SUMMARY] Sending summary for ${dateLabel}: ${rows.length} order(s).`,
    );

    await this.sendSummaryEmail(startDate, endDate, rows, totals);
  }

  /**
   * Runs the scheduled daily summary for Spain today.
   * Checks the idempotency marker and persists it after sending.
   */
  async runScheduledDaily(now: Date = new Date()): Promise<void> {
    const spainDateStr = this.getSpainDateString(now);

    if (await this.wasSummaryAlreadySent(spainDateStr)) {
      console.log(
        `[ORDERS-SUMMARY] Summary for ${spainDateStr} already sent. Skipping.`,
      );
      return;
    }

    await this.generateOrdersSummary(spainDateStr);
    await this.markSummaryAsSent(spainDateStr);

    console.log(
      `[ORDERS-SUMMARY] Summary for ${spainDateStr} sent and marked.`,
    );
  }
}

export default OrdersSummaryService;
