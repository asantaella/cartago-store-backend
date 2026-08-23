import { execFile } from "node:child_process";
import { promisify } from "node:util";
import dotenv from "dotenv";
import { describe, expect, it, beforeAll } from "@jest/globals";

dotenv.config({ path: `${process.cwd()}/.env.local` });

const execFileAsync = promisify(execFile);
const VARIANT_ID = "variant_01KS3MA0ZF671E1BV78EQ0WP6B";
const BASE_URL = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";
const REGION_ID = process.env.E2E_REGION_ID || "reg_01HZZEJSR0CWRSVFWSZQ2ANKV7";
const SHIPPING_OPTION_ID =
  process.env.E2E_SHIPPING_OPTION_ID || "so_01HZZEJSSMCE0J4PP4TD3D4Y6X";
const TEST_EMAIL =
  process.env.E2E_DRAFT_ORDER_EMAIL || "e2e-draft-order@cartago.test";

describe("Draft order native totals E2E", () => {
  let adminToken: string;

  beforeAll(async () => {
    const { stdout } = await execFileAsync("node", ["e2e/auth/index.mjs"], {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 1024 * 1024,
    });
    const tokenMatch = stdout.match(/Token response:\s*"([^"]+)"/);
    if (!tokenMatch) {
      throw new Error("e2e/auth/index.mjs did not return an access token");
    }
    adminToken = tokenMatch[1];
  }, 30000);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
        ...(init.headers || {}),
      },
    });
    const body = await response.json().catch(() => undefined);

    if (!response.ok) {
      throw new Error(
        `${init.method || "GET"} ${path} failed with ${response.status}: ${JSON.stringify(body)}`,
      );
    }

    return body as T;
  }

  function getNumber(value: unknown, field: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Expected numeric ${field}, received ${String(value)}`);
    }
    return value;
  }

  it("creates a draft order and preserves native shipping totals after quantity update", async () => {
    const [variantResponse, shippingResponse] = await Promise.all([
      request<{ variants: any[] }>(
        `/admin/variants?id[0]=${encodeURIComponent(VARIANT_ID)}&region_id=${encodeURIComponent(REGION_ID)}&fields=id%2Cshipping_option_price_extra`,
      ),
      request<{ shipping_option: any }>(
        `/admin/shipping-options/${encodeURIComponent(SHIPPING_OPTION_ID)}`,
      ),
    ]);

    const variant = variantResponse.variants?.find(
      (item) => item.id === VARIANT_ID,
    );
    expect(variant).toBeDefined();

    const shippingOption = shippingResponse.shipping_option;
    const baseShippingPrice = getNumber(
      process.env.E2E_BASE_SHIPPING_PRICE
        ? Number(process.env.E2E_BASE_SHIPPING_PRICE)
        : shippingOption.amount,
      "base shipping price",
    );
    const shippingExtra = getNumber(
      variant.shipping_option_price_extra,
      "variant shipping extra",
    );
    const taxRate = getNumber(
      shippingOption.region?.tax_rate || 0,
      "shipping tax rate",
    );
    const shippingIncludesTax = shippingOption.includes_tax === true;
    const expectedShippingTotal = (grossPrice: number) =>
      shippingIncludesTax && taxRate > 0
        ? Math.round(grossPrice / (1 + taxRate / 100))
        : grossPrice;

    const created = await request<{ draft_order: any }>("/admin/draft-orders", {
      method: "POST",
      body: JSON.stringify({
        email: TEST_EMAIL,
        region_id: REGION_ID,
        items: [{ variant_id: VARIANT_ID, quantity: 1 }],
        shipping_methods: [
          { option_id: SHIPPING_OPTION_ID, price: baseShippingPrice },
        ],
      }),
    });

    const draftOrder = created.draft_order;
    const createdCart = draftOrder.cart;
    const createdItem = createdCart.items.find(
      (item: any) => item.variant_id === VARIANT_ID,
    );
    expect(createdItem).toBeDefined();
    expect(createdItem.quantity).toBe(1);
    expect(createdCart.shipping_methods).toHaveLength(1);
    expect(createdCart.shipping_methods[0].price).toBe(
      baseShippingPrice + shippingExtra,
    );
    expect(createdCart.shipping_total).toBe(
      expectedShippingTotal(baseShippingPrice + shippingExtra),
    );

    const updated = await request<{ draft_order: any }>(
      `/admin/draft-orders/${encodeURIComponent(draftOrder.id)}/line-items/${encodeURIComponent(createdItem.id)}`,
      {
        method: "POST",
        body: JSON.stringify({ quantity: 2 }),
      },
    );

    const updatedCart = updated.draft_order.cart;
    const updatedItem = updatedCart.items.find(
      (item: any) => item.id === createdItem.id,
    );
    expect(updatedItem).toBeDefined();
    expect(updatedItem.quantity).toBe(2);
    expect(updatedCart.shipping_methods).toHaveLength(1);
    expect(updatedCart.shipping_methods[0].price).toBe(
      baseShippingPrice + shippingExtra * 2,
    );
    expect(updatedCart.shipping_total).toBe(
      expectedShippingTotal(baseShippingPrice + shippingExtra * 2),
    );
  });
});
