import { registerOverriddenValidators } from "@medusajs/medusa";
import { AdminPostProductsProductVariantsVariantReq as MedusaAdminPostProductsProductVariantsVariantReq } from "@medusajs/medusa/dist/api/routes/admin/products/update-variant";
import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import {
  IsInt,
  IsString,
  Matches,
  Min,
  ValidateIf,
} from "class-validator";
import type { NextFunction } from "express";

export const STOCK_LOCATION_CODE_PATTERN = /^[A-Z](?:[1-9]|[1-9][0-9]|999)$/;


/**
 * Extends Medusa's native variant update request with Cartago's persisted fields.
 * The class name must match Medusa's validator name for the override registry.
 */
export class AdminPostProductsProductVariantsVariantReq extends MedusaAdminPostProductsProductVariantsVariantReq {
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @Matches(STOCK_LOCATION_CODE_PATTERN)
  stock_location_code?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  shipping_option_price_extra?: number;
}

registerOverriddenValidators(AdminPostProductsProductVariantsVariantReq);

type ProductVariantPayload = Record<string, unknown>;

const isRecord = (value: unknown): value is ProductVariantPayload =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Preserves the native variant payload and Cartago's canonical persisted fields.
 * Native Medusa validation runs after this middleware; the validator override
 * above makes the custom fields part of the accepted native payload.
 */
const extendProductVariantPayload = (body: unknown): unknown =>
  isRecord(body)
    ? {
        ...body,
        ...(body.shipping_option_price_extra === "" && {
          // An empty HTML input is serialized as an empty string. Normalize it
          // to an explicitly undefined optional field before validation.
          shipping_option_price_extra: undefined,
        }),
        ...(body.stock_location_code === "" && {
          // stock_location_code is nullable, so an empty input clears it.
          stock_location_code: null,
        }),
      }
    : body;

function extendProductVariantPayloadMiddleware(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: NextFunction,
): void {
  req.body = extendProductVariantPayload(req.body);
  next();
}

export const extendProductVariantPostPayload =
  extendProductVariantPayloadMiddleware;
export const extendProductVariantPatchPayload =
  extendProductVariantPayloadMiddleware;
