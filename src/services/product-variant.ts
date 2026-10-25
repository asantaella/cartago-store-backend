import {
  ProductVariantService as MedusaProductVariantService,
  type ProductVariant,
} from "@medusajs/medusa";
import type {
  UpdateProductVariantData,
  UpdateProductVariantInput,
} from "@medusajs/medusa/dist/types/product-variant";

const STOCK_SNAPSHOT_KEY = "stock_zero_alert_last_inventory_quantity";

const stripStockSnapshot = (
  updateData: UpdateProductVariantInput,
): UpdateProductVariantInput => {
  const metadata = updateData.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return updateData;
  }

  const { [STOCK_SNAPSHOT_KEY]: _snapshot, ...clientMetadata } = metadata;
  return { ...updateData, metadata: clientMetadata };
};

class ProductVariantService extends MedusaProductVariantService {
  update(variantData: UpdateProductVariantData[]): Promise<ProductVariant[]>;
  update(
    variantOrVariantId: string | Partial<ProductVariant>,
    updateData: UpdateProductVariantInput,
  ): Promise<ProductVariant>;
  update(
    variantOrVariantIdOrData:
      | string
      | Partial<ProductVariant>
      | UpdateProductVariantData[],
    updateData?: UpdateProductVariantInput,
  ): Promise<ProductVariant | ProductVariant[]> {
    if (Array.isArray(variantOrVariantIdOrData)) {
      const sanitizedData = variantOrVariantIdOrData.map(({ variant, updateData }) => ({
        variant,
        updateData: stripStockSnapshot(updateData),
      }));

      return super.update(sanitizedData);
    }

    if (!updateData) {
      throw new Error("Product variant update data is required");
    }

    return super.update(
      variantOrVariantIdOrData,
      stripStockSnapshot(updateData),
    );
  }

  updateStockSnapshot(
    variantId: string,
    inventoryQuantity: number,
  ): Promise<ProductVariant> {
    return super.update(variantId, {
      metadata: { [STOCK_SNAPSHOT_KEY]: inventoryQuantity },
    });
  }
}

export default ProductVariantService;
