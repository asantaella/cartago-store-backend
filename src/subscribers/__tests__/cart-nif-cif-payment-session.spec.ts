import { config, releasePaymentSessionWithoutNifCif } from "../cart-nif-cif-payment-session"

function buildContainer(cart: Record<string, unknown> | Error) {
  const cartService = {
    retrieveWithTotals:
      cart instanceof Error
        ? jest.fn().mockRejectedValue(cart)
        : jest.fn().mockResolvedValue(cart),
    deletePaymentSession: jest.fn().mockResolvedValue(undefined),
  }
  const container = {
    resolve: jest.fn().mockImplementation((name: string) => {
      if (name === "cartService") return cartService
      throw new Error(`Unknown service: ${name}`)
    }),
  }
  return { container: container as any, cartService }
}

function makeCart(overrides: Record<string, unknown> = {}) {
  return {
    id: "cart_1",
    total: 40_000,
    region: { currency_code: "eur" },
    shipping_address: { metadata: {} },
    billing_address: { metadata: {} },
    payment_session: { provider_id: "stripe", status: "pending" },
    ...overrides,
  }
}

describe("releasePaymentSessionWithoutNifCif", () => {
  it("listens to cart.updated", () => {
    expect(config.event).toBe("cart.updated")
  })

  it("deletes the selected pending session of a EUR cart of €400 or more without NIF/CIF", async () => {
    const { container, cartService } = buildContainer(makeCart())

    await releasePaymentSessionWithoutNifCif({ data: { id: "cart_1" }, container })

    expect(cartService.retrieveWithTotals).toHaveBeenCalledWith(
      "cart_1",
      expect.objectContaining({
        relations: expect.arrayContaining([
          "region",
          "shipping_address",
          "billing_address",
          "payment_session",
        ]),
      }),
    )
    expect(cartService.deletePaymentSession).toHaveBeenCalledWith("cart_1", "stripe")
  })

  it.each([
    ["has a NIF/CIF", { shipping_address: { metadata: { nif_cif: "B12345678" } } }],
    ["is below €400", { total: 39_999 }],
    ["is not EUR", { region: { currency_code: "usd" } }],
    ["has no selected session", { payment_session: null }],
    ["has an authorized session (payment in flight)", { payment_session: { provider_id: "stripe", status: "authorized" } }],
  ])("keeps the session when the cart %s", async (_label, overrides) => {
    const { container, cartService } = buildContainer(makeCart(overrides))

    await releasePaymentSessionWithoutNifCif({ data: { id: "cart_1" }, container })

    expect(cartService.deletePaymentSession).not.toHaveBeenCalled()
  })

  it("ignores events without a cart id", async () => {
    const { container, cartService } = buildContainer(makeCart())

    await releasePaymentSessionWithoutNifCif({ data: {}, container })

    expect(cartService.retrieveWithTotals).not.toHaveBeenCalled()
  })

  it("logs and swallows failures so the event bus keeps running", async () => {
    const error = new Error("boom")
    const { container } = buildContainer(error)
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(
      releasePaymentSessionWithoutNifCif({ data: { id: "cart_1" }, container }),
    ).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()

    spy.mockRestore()
  })
})
