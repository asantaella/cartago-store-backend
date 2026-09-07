import { registerOverriddenValidators } from "@medusajs/medusa";
import { AdminPostProductsProductVariantsReq as MedusaAdminPostProductsProductVariantsReq } from "@medusajs/medusa/dist/api/routes/admin/products/create-variant";
import { AdminPostProductsProductVariantsVariantReq as MedusaAdminPostProductsProductVariantsVariantReq } from "@medusajs/medusa/dist/api/routes/admin/products/update-variant";
import { AdminPostProductsReq as MedusaAdminPostProductsReq } from "@medusajs/medusa/dist/api/routes/admin/products/create-product";
import { AdminPostProductsProductReq as MedusaAdminPostProductsProductReq } from "@medusajs/medusa/dist/api/routes/admin/products/update-product";
import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
  IsArray,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type { NextFunction } from "express";

export const STOCK_LOCATION_CODE_PATTERN = /^[A-Z](?:[1-9]|[1-9][0-9]|100)$/;


/**
 * Extends Medusa's native variant update request with Cartago's persisted fields.
 * The class name must match Medusa's validator name for the override registry.
 */
export class AdminPostProductsProductVariantsVariantReq extends MedusaAdminPostProductsProductVariantsVariantReq {
  @IsOptional()
  @IsString()
  @Matches(STOCK_LOCATION_CODE_PATTERN)
  stock_location_code?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  shipping_option_price_extra?: number;
}

registerOverriddenValidators(AdminPostProductsProductVariantsVariantReq);

/**
 * Extends Medusa's native product variant creation request with Cartago's
 * persisted stock location field.
 */
export class AdminPostProductsProductVariantsReq extends MedusaAdminPostProductsProductVariantsReq {
  @IsOptional()
  @IsString()
  @Matches(STOCK_LOCATION_CODE_PATTERN)
  stock_location_code?: string | null;
}

registerOverriddenValidators(AdminPostProductsProductVariantsReq);

// Medusa does not export the nested create-product option DTO. This is the
// only nested DTO needed locally because the full product creation contract
// accepts `{ value }`, while the standalone create-variant DTO requires an
// `option_id` as well.
class ProductVariantCreateOptionReq {
  @IsString()
  value: string;
}

/** Native full-product creation variant plus Cartago's persisted field. */
class ProductVariantCreateReq extends MedusaAdminPostProductsProductVariantsReq {
  constructor() {
    super();
    // The standalone create-variant DTO defaults this field to true, while
    // the nested create-product DTO leaves it undefined.
    delete this.manage_inventory;
  }

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantCreateOptionReq)
  options?: MedusaAdminPostProductsProductVariantsReq["options"];

  @IsOptional()
  @IsString()
  @Matches(STOCK_LOCATION_CODE_PATTERN)
  stock_location_code?: string | null;
}

/**
 * Native full-product update variant plus its non-exported native id field and
 * Cartago's persisted field.
 */
class ProductVariantUpdateReq extends MedusaAdminPostProductsProductVariantsVariantReq {
  // The full-product update DTO includes `id`, but Medusa's exported
  // update-variant DTO does not. Keep that one native-contract difference local
  // instead of duplicating the rest of the variant DTO.
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  @Matches(STOCK_LOCATION_CODE_PATTERN)
  stock_location_code?: string | null;
}

/** Full product creation validator retaining Medusa's top-level contract. */
export class AdminPostProductsReq extends MedusaAdminPostProductsReq {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantCreateReq)
  variants?: ProductVariantCreateReq[];
}

/** Full product update validator retaining Medusa's top-level contract. */
export class AdminPostProductsProductReq extends MedusaAdminPostProductsProductReq {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantUpdateReq)
  variants?: ProductVariantUpdateReq[];
}

registerOverriddenValidators(AdminPostProductsReq);
registerOverriddenValidators(AdminPostProductsProductReq);

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
