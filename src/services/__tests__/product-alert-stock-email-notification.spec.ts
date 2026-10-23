import ProductAlertStockEmailNotification from "../product-alert-stock-email-notification";

describe("ProductAlertStockEmailNotification.sendEmailAdminStockZeroAlert", () => {
  const originalAdminEmail = process.env.ADMIN_EMAIL;
  const originalStoreUrl = process.env.STORE_URL;

  beforeEach(() => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.STORE_URL = "https://shop.example";
  });

  afterEach(() => {
    if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalAdminEmail;

    if (originalStoreUrl === undefined) delete process.env.STORE_URL;
    else process.env.STORE_URL = originalStoreUrl;
    jest.restoreAllMocks();
  });

  it("sends the admin a rendered stock-zero email with the variant details", async () => {
    const notification = new ProductAlertStockEmailNotification();
    const sendEmailWithRetry = jest
      .fn()
      .mockResolvedValue({ messageId: "msg_01" });
    (notification as any).sendEmailWithRetry = sendEmailWithRetry;

    await notification.sendEmailAdminStockZeroAlert(
      {
        title: "Trail Variant",
        sku: "TRAIL-001",
      },
      {
        title: "Trail Product",
        handle: "trail-product",
        thumbnail: "https://cdn.example/trail.jpg",
      },
      "var_01",
    );

    const [payload, context] = sendEmailWithRetry.mock.calls[0];
    expect(payload.to).toEqual([{ email: "admin@example.com", name: undefined }]);
    expect(payload.subject).toContain("Trail Variant");
    expect(payload.htmlContent).toContain("Trail Product");
    expect(payload.htmlContent).toContain("Trail Variant");
    expect(payload.htmlContent).toContain("TRAIL-001");
    expect(payload.htmlContent).toContain("https://cdn.example/trail.jpg");
    expect(payload.htmlContent).toContain("0");
    expect(payload.htmlContent).toContain(
      "https://shop.example/products/trail-product?variant&#x3D;var_01",
    );
    expect(context).toContain("var_01");
  });

  it("warns and skips sending when ADMIN_EMAIL is missing", async () => {
    delete process.env.ADMIN_EMAIL;
    const notification = new ProductAlertStockEmailNotification();
    const sendEmailWithRetry = jest.fn();
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    (notification as any).sendEmailWithRetry = sendEmailWithRetry;

    await notification.sendEmailAdminStockZeroAlert(
      { title: "Trail Variant", sku: "TRAIL-001" },
      { title: "Trail Product", handle: "trail-product" },
      "var_01",
    );

    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("ADMIN_EMAIL"),
    );
    expect(sendEmailWithRetry).not.toHaveBeenCalled();
  });
});
