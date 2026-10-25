import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import Medusa from "@medusajs/medusa-js";
import dotenv from "dotenv";
import { describe, expect, it } from "@jest/globals";

const SNAPSHOT_KEY = "stock_zero_alert_last_inventory_quantity";
const PRODUCT_ID = process.env.E2E_STOCK_ZERO_PRODUCT_ID?.trim();
const VARIANT_ID = process.env.E2E_STOCK_ZERO_VARIANT_ID?.trim();
const BASE_URL = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";

function loadMedusaApiKey(): string | undefined {
  const configuredKey = process.env.MEDUSA_API_KEY?.trim();
  if (configuredKey) {
    return configuredKey;
  }

  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envLocalPath)) {
    return undefined;
  }

  try {
    return dotenv.parse(readFileSync(envLocalPath, "utf8")).MEDUSA_API_KEY?.trim();
  } catch {
    return undefined;
  }
}

const API_KEY = loadMedusaApiKey();
const configuredE2e = Boolean(PRODUCT_ID && VARIANT_ID && API_KEY);
const runE2e = configuredE2e ? it : it.skip;

type VariantState = {
  id: string;
  inventory_quantity: number;
  metadata?: Record<string, unknown> | null;
};

describe("stock-zero snapshot native variant-update E2E", () => {
  runE2e(
    "keeps a stale client snapshot out of a metadata-only update",
    async () => {
      const medusa = new Medusa({
        baseUrl: BASE_URL,
        maxRetries: 0,
      });
      const productId = PRODUCT_ID!;
      const variantId = VARIANT_ID!;
      const authHeaders = { Authorization: `Bearer ${API_KEY}` };

      async function retrieveVariant(): Promise<VariantState> {
        try {
          const { product } = await medusa.admin.products.retrieve(
            productId,
            authHeaders,
          );
          const variant = product.variants?.find(
            (candidate) => candidate.id === variantId,
          );
          if (!variant) {
            throw new Error("Configured stock-zero E2E variant was not returned");
          }
          return variant as VariantState;
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "Configured stock-zero E2E variant was not returned"
          ) {
            throw error;
          }

          const status = (error as { response?: { status?: unknown } })?.response
            ?.status;
          throw new Error(
            `Could not retrieve the stock-zero E2E fixture${typeof status === "number" ? ` (${status})` : ""}`,
          );
        }
      }

      async function updateVariant(payload: Record<string, any>): Promise<void> {
        try {
          await medusa.admin.products.updateVariant(
            productId,
            variantId,
            payload,
            authHeaders,
          );
        } catch (error) {
          const status = (error as { response?: { status?: unknown } })?.response
            ?.status;
          throw new Error(
            `Could not update the stock-zero E2E fixture${typeof status === "number" ? ` (${status})` : ""}`,
          );
        }
      }

      async function waitForVariant(
        predicate: (variant: VariantState) => boolean,
        timeoutMs = 15_000,
      ): Promise<VariantState> {
        const deadline = Date.now() + timeoutMs;
        let latest = await retrieveVariant();

        while (!predicate(latest) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          latest = await retrieveVariant();
        }

        if (!predicate(latest)) {
          throw new Error("Timed out waiting for the stock-zero fixture state");
        }

        return latest;
      }

      const originalVariant = await retrieveVariant();
      const originalInventory = originalVariant.inventory_quantity;
      const originalMetadata = { ...(originalVariant.metadata ?? {}) };
      const originalSnapshot = originalMetadata[SNAPSHOT_KEY];

      if (originalInventory !== 0 || originalSnapshot !== 0) {
        throw new Error(
          "Stock-zero E2E fixture must start at inventory and snapshot zero",
        );
      }

      let markerKey = `stock_zero_e2e_${Date.now()}`;
      while (Object.prototype.hasOwnProperty.call(originalMetadata, markerKey)) {
        markerKey += "_test";
      }
      const markerValue = `preserved_${Date.now()}`;
      let mutationStarted = false;

      try {
        mutationStarted = true;
        await updateVariant({ inventory_quantity: 1 });

        await waitForVariant(
          (variant) =>
            variant.inventory_quantity === 1 &&
            variant.metadata?.[SNAPSHOT_KEY] === 1,
        );

        await updateVariant({
          metadata: {
            ...originalMetadata,
            [SNAPSHOT_KEY]: 0,
            [markerKey]: markerValue,
          },
        });

        const afterMetadataUpdate = await retrieveVariant();
        expect(afterMetadataUpdate.inventory_quantity).toBe(1);
        expect(afterMetadataUpdate.metadata?.[SNAPSHOT_KEY]).toBe(1);
        expect(afterMetadataUpdate.metadata?.[markerKey]).toBe(markerValue);

        for (const [key, value] of Object.entries(originalMetadata)) {
          if (key !== SNAPSHOT_KEY) {
            expect(
              isDeepStrictEqual(afterMetadataUpdate.metadata?.[key], value),
            ).toBe(true);
          }
        }
      } finally {
        if (mutationStarted) {
          // Restoring zero after a successful 0→1 cycle is a real 1→0 update
          // and can send one stock-zero admin alert.
          await updateVariant({ inventory_quantity: originalInventory });
          await waitForVariant(
            (variant) =>
              variant.inventory_quantity === originalInventory &&
              variant.metadata?.[SNAPSHOT_KEY] === originalSnapshot,
          );

          // Medusa treats an empty metadata string as deletion, so cleanup
          // removes the temporary marker without leaving fixture residue.
          await updateVariant({
            metadata: { ...originalMetadata, [markerKey]: "" },
          });
          const restoredVariant = await waitForVariant(
            (variant) =>
              variant.inventory_quantity === originalInventory &&
              variant.metadata?.[SNAPSHOT_KEY] === originalSnapshot,
          );

          if (!isDeepStrictEqual(restoredVariant.metadata ?? {}, originalMetadata)) {
            throw new Error("Stock-zero E2E fixture metadata was not restored");
          }
        }
      }
    },
    60_000,
  );
});
