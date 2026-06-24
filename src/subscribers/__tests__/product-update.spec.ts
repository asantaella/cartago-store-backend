import { processProductUpdate } from "../product-update"
import { ProductStatus } from "@medusajs/types"

function buildContainer({
  product = null,
}: {
  product?: Record<string, unknown> | null
} = {}) {
  const mockProductService = {
    retrieve: jest.fn().mockResolvedValue(product),
  }

  const mockProductVariantService = {
    update: jest.fn().mockResolvedValue(undefined),
  }

  const mockAlgoliaService = {
    syncProduct: jest.fn().mockResolvedValue(undefined),
  }

  return {
    container: {
      resolve: jest.fn().mockImplementation((name: string) => {
        if (name === "productService") return mockProductService
        if (name === "productVariantService") return mockProductVariantService
        if (name === "algoliaService") return mockAlgoliaService
        throw new Error(`Unknown service: ${name}`)
      }),
    },
    mocks: {
      productService: mockProductService,
      productVariantService: mockProductVariantService,
      algoliaService: mockAlgoliaService,
    },
  }
}

const baseProduct = {
  id: "prod_01",
  status: ProductStatus.PUBLISHED,
  variants: [{ id: "var_01" }, { id: "var_02" }],
}

describe("product-update subscriber — manage_inventory default", () => {
  it("sets manage_inventory=true on every variant when a product is created", async () => {
    const { container, mocks } = buildContainer({ product: baseProduct })

    await processProductUpdate({
      data: { id: "prod_01" },
      eventName: "product.created",
      container: container as any,
      pluginOptions: {},
    })

    expect(mocks.productVariantService.update).toHaveBeenCalledTimes(2)
    expect(mocks.productVariantService.update).toHaveBeenNthCalledWith(
      1,
      "var_01",
      { manage_inventory: true }
    )
    expect(mocks.productVariantService.update).toHaveBeenNthCalledWith(
      2,
      "var_02",
      { manage_inventory: true }
    )
  })

  it("sets manage_inventory=true on the new variant when a variant is created", async () => {
    const { container, mocks } = buildContainer({ product: baseProduct })

    await processProductUpdate({
      data: { id: "var_99", product_id: "prod_01" },
      eventName: "product-variant.created",
      container: container as any,
      pluginOptions: {},
    })

    expect(mocks.productVariantService.update).toHaveBeenCalledTimes(1)
    expect(mocks.productVariantService.update).toHaveBeenCalledWith(
      "var_99",
      { manage_inventory: true }
    )
  })

  it("does not change manage_inventory on product update (only on create)", async () => {
    const { container, mocks } = buildContainer({ product: baseProduct })

    await processProductUpdate({
      data: { id: "prod_01" },
      eventName: "product.updated",
      container: container as any,
      pluginOptions: {},
    })

    expect(mocks.productVariantService.update).not.toHaveBeenCalled()
    // Algolia sync still runs on update, regression guard
    expect(mocks.algoliaService.syncProduct).toHaveBeenCalledWith(baseProduct)
  })

  it("tolerates a product with no variants on create", async () => {
    const productWithoutVariants = {
      ...baseProduct,
      variants: [],
    }
    const { container, mocks } = buildContainer({
      product: productWithoutVariants,
    })

    await processProductUpdate({
      data: { id: "prod_02" },
      eventName: "product.created",
      container: container as any,
      pluginOptions: {},
    })

    expect(mocks.productVariantService.update).not.toHaveBeenCalled()
  })

  it("returns early without calling any service when no product id is in the event data", async () => {
    const { container, mocks } = buildContainer()

    await processProductUpdate({
      data: {},
      eventName: "product.created",
      container: container as any,
      pluginOptions: {},
    })

    expect(mocks.productService.retrieve).not.toHaveBeenCalled()
    expect(mocks.productVariantService.update).not.toHaveBeenCalled()
  })
})
