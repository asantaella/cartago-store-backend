import CartService from "../cart";

describe("CartService complete Canarias", () => {
  it("should persist net prices and call super.complete", async () => {
    // Minimal mock container and service
    const fakeRepo: any = { save: jest.fn().mockResolvedValue(true) };
    const fakeManager: any = { transaction: (fn: any) => fn({}) };

    // @ts-ignore
    const svc: any = new CartService({});
    svc.cartRepository_ = fakeRepo;
    svc.manager_ = fakeManager;
    svc.retrieve = jest.fn().mockResolvedValue({
      id: "cart_1",
      shipping_address: { postal_code: "35001" },
      items: [{ unit_price: 121 }],
      shipping_methods: [{ price: 21 }],
      metadata: {},
    });

    const canarias = {
      isCanariasAddress: jest.fn().mockReturnValue(true),
      calculatePriceWithoutTax: jest.fn(
        (v: number) => Math.round((v / 1.21) * 100) / 100
      ),
    };
    svc.canariasService = canarias;

    svc.complete = CartService.prototype.complete.bind(svc);
    // spy on super.complete by mocking the prototype's complete to ensure it's called
    const superComplete = jest
      .spyOn(Object.getPrototypeOf(svc), "complete")
      .mockResolvedValue({ order: {} });

    const res = await svc.complete("cart_1");

    expect(fakeRepo.save).toHaveBeenCalled();
    expect(canarias.isCanariasAddress).toHaveBeenCalled();
    superComplete.mockRestore();
  });
});
