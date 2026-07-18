import { processProductUpdate } from "../product-update"
import { ProductStatus } from "@medusajs/types"

const SHIPPING_EXCEPTION_COLLECTION = "shipping-except-collection"

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

const manageInventoryPayload = {
  manage_inventory: true,
  allow_backorder: false,
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
      manageInventoryPayload,
    )
    expect(mocks.productVariantService.update).toHaveBeenNthCalledWith(
      2,
      "var_02",
      manageInventoryPayload,
    )
  })

  it("sets manage_inventory=true on every variant when a product is updated", async () => {
    const { container, mocks } = buildContainer({ product: baseProduct })

    await processProductUpdate({
      data: { id: "prod_01" },
      eventName: "product.updated",
      container: container as any,
      pluginOptions: {},
    })

    expect(mocks.productVariantService.update).toHaveBeenCalledTimes(2)
    expect(mocks.productVariantService.update).toHaveBeenNthCalledWith(
      1,
      "var_01",
      manageInventoryPayload,
    )
    expect(mocks.productVariantService.update).toHaveBeenNthCalledWith(
      2,
      "var_02",
      manageInventoryPayload,
    )
  })

  it("sets manage_inventory=true on a new variant when a variant is created", async () => {
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
      manageInventoryPayload,
    )
  })

  it("sets manage_inventory=true on a variant when a variant is updated", async () => {
    const { container, mocks } = buildContainer({ product: baseProduct })

    await processProductUpdate({
      data: { id: "var_99", product_id: "prod_01" },
      eventName: "product-variant.updated",
      container: container as any,
      pluginOptions: {},
    })

    expect(mocks.productVariantService.update).toHaveBeenCalledTimes(1)
    expect(mocks.productVariantService.update).toHaveBeenCalledWith(
      "var_99",
      manageInventoryPayload,
    )
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

const shippingExceptionProduct = {
  ...baseProduct,
  collection: { handle: SHIPPING_EXCEPTION_COLLECTION },
}

describe("product-update subscriber — allow_backorder for shipping exception collection", () => {
  const ORIGINAL_ENV = process.env.COLLECTION_SHIPPING_EXCEPTION

  beforeAll(() => {
    process.env.COLLECTION_SHIPPING_EXCEPTION = SHIPPING_EXCEPTION_COLLECTION
  })

  afterAll(() => {
    process.env.COLLECTION_SHIPPING_EXCEPTION = ORIGINAL_ENV
  })

  it("sets allow_backorder=true on all variants when a product is created with the shipping exception collection", async () => {
    const { container, mocks } = buildContainer({
      product: shippingExceptionProduct,
    })

    await processProductUpdate({
      data: { id: "prod_01" },
      eventName: "product.created",
      container: container as any,
      pluginOptions: {},
    })

    // 2 manage_inventory + 2 allow_backorder
    expect(mocks.productVariantService.update).toHaveBeenCalledTimes(4)
    expect(mocks.productVariantService.update).toHaveBeenCalledWith("var_01", {
      allow_backorder: true,
    })
    expect(mocks.productVariantService.update).toHaveBeenCalledWith("var_02", {
      allow_backorder: true,
    })
    // Guard: manage_inventory calls also present
    expect(mocks.productVariantService.update).toHaveBeenCalledWith(
      "var_01",
      manageInventoryPayload,
    )
    expect(mocks.productVariantService.update).toHaveBeenCalledWith(
      "var_02",
      manageInventoryPayload,
    )
  })

  it("sets allow_backorder=true on all variants when a product is updated with the shipping exception collection", async () => {
    const { container, mocks } = buildContainer({
      product: shippingExceptionProduct,
    })

    await processProductUpdate({
      data: { id: "prod_01" },
      eventName: "product.updated",
      container: container as any,
      pluginOptions: {},
    })

    // 2 manage_inventory + 2 allow_backorder
    expect(mocks.productVariantService.update).toHaveBeenCalledTimes(4)
    expect(mocks.productVariantService.update).toHaveBeenCalledWith("var_01", {
      allow_backorder: true,
    })
    expect(mocks.productVariantService.update).toHaveBeenCalledWith("var_02", {
      allow_backorder: true,
    })
  })

  it("sets allow_backorder=true on a new variant when a variant is created with the shipping exception collection", async () => {
    const { container, mocks } = buildContainer({
      product: shippingExceptionProduct,
    })

    await processProductUpdate({
      data: { id: "var_99", product_id: "prod_01" },
      eventName: "product-variant.created",
      container: container as any,
      pluginOptions: {},
    })

    // 1 manage_inventory + 1 allow_backorder
    expect(mocks.productVariantService.update).toHaveBeenCalledTimes(2)
    expect(mocks.productVariantService.update).toHaveBeenCalledWith("var_99", {
      allow_backorder: true,
    })
  })

  it("sets allow_backorder=true on a variant when a variant is updated with the shipping exception collection", async () => {
    const { container, mocks } = buildContainer({
      product: shippingExceptionProduct,
    })

    await processProductUpdate({
      data: { id: "var_99", product_id: "prod_01" },
      eventName: "product-variant.updated",
      container: container as any,
      pluginOptions: {},
    })

    // 1 manage_inventory + 1 allow_backorder
    expect(mocks.productVariantService.update).toHaveBeenCalledTimes(2)
    expect(mocks.productVariantService.update).toHaveBeenCalledWith("var_99", {
      allow_backorder: true,
    })
  })

  it("does not set allow_backorder when the product's collection handle does not match", async () => {
    const nonMatchingProduct = {
      ...baseProduct,
      collection: { handle: "some-other-collection" },
    }
    const { container, mocks } = buildContainer({
      product: nonMatchingProduct,
    })

    await processProductUpdate({
      data: { id: "prod_01" },
      eventName: "product.created",
      container: container as any,
      pluginOptions: {},
    })

    // Only manage_inventory calls (2), no allow_backorder
    expect(mocks.productVariantService.update).toHaveBeenCalledTimes(2)
    const allowBackorderCalls = mocks.productVariantService.update.mock.calls.filter(
      (call: unknown[]) =>
        (call[1] as Record<string, unknown>)?.allow_backorder === true,
    )
    expect(allowBackorderCalls).toHaveLength(0)
  })

  it("does not set allow_backorder when the env var is not set", async () => {
    delete process.env.COLLECTION_SHIPPING_EXCEPTION
    const { container, mocks } = buildContainer({
      product: shippingExceptionProduct,
    })

    await processProductUpdate({
      data: { id: "prod_01" },
      eventName: "product.created",
      container: container as any,
      pluginOptions: {},
    })

    // Only manage_inventory calls (2), no allow_backorder
    expect(mocks.productVariantService.update).toHaveBeenCalledTimes(2)
    const allowBackorderCalls = mocks.productVariantService.update.mock.calls.filter(
      (call: unknown[]) =>
        (call[1] as Record<string, unknown>)?.allow_backorder === true,
    )
    expect(allowBackorderCalls).toHaveLength(0)

    // Restore for subsequent tests
    process.env.COLLECTION_SHIPPING_EXCEPTION = SHIPPING_EXCEPTION_COLLECTION
  })

  it("does not set allow_backorder when the product has no collection", async () => {
    const { container, mocks } = buildContainer({ product: baseProduct })

    await processProductUpdate({
      data: { id: "prod_01" },
      eventName: "product.created",
      container: container as any,
      pluginOptions: {},
    })

    // Only manage_inventory calls (2), no allow_backorder
    expect(mocks.productVariantService.update).toHaveBeenCalledTimes(2)
    const allowBackorderCalls = mocks.productVariantService.update.mock.calls.filter(
      (call: unknown[]) =>
        (call[1] as Record<string, unknown>)?.allow_backorder === true,
    )
    expect(allowBackorderCalls).toHaveLength(0)
  })
})
