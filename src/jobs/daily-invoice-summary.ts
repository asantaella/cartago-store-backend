import { MedusaContainer } from "@medusajs/medusa";
import OrdersSummaryService from "../services/orders-summary";

const MADRID_TZ = "Europe/Madrid";

/**
 * Scheduled daily invoice summary job.
 *
 * Runs at 21:59 and 22:59 UTC every day to cover both:
 *   - Summer DST (UTC+2): 21:59 UTC = 23:59 Madrid
 *   - Winter    (UTC+1): 22:59 UTC = 23:59 Madrid
 *
 * The service checks that the Spain time is ≥ 23:xx before sending,
 * and persists an idempotency marker so the email is sent at most once
 * per Spain calendar day even if both cron slots fire.
 */
export default async function dailyInvoiceSummaryJob(
  container: MedusaContainer,
): Promise<void> {
  const now = new Date();

  // Check Madrid hour – only proceed if it's 23:xx in Spain time
  const madridHour = parseInt(
    now.toLocaleString("en-US", {
      timeZone: MADRID_TZ,
      hour: "2-digit",
      hour12: false,
    }),
    10,
  );

  if (madridHour < 23) {
    console.log(
      `[ORDERS-SUMMARY] Madrid hour is ${madridHour}, not yet 23:xx. Skipping.`,
    );
    return;
  }

  const ordersSummaryService: OrdersSummaryService = container.resolve(
    "ordersSummaryService",
  );

  await ordersSummaryService.runScheduledDaily(now);
}

export const config = {
  name: "daily-invoice-summary",
  // Fires at 21:59 and 22:59 UTC – covers both Madrid summer (UTC+2)
  // and winter (UTC+1) 23:59 local time.
  schedule: "59 21,22 * * *",
};
