import { POST } from "./route";

jest.mock(
  "../../../../plugins/medusa-payment-paypal/dist/api/routes/hooks/paypal",
  () => ({
    __esModule: true,
    default: jest.fn(),
  }),
  { virtual: true },
);

const paypalWebhookHandler = require(
  "../../../../plugins/medusa-payment-paypal/dist/api/routes/hooks/paypal",
).default;

type MockResponse = {
  sendStatus: jest.Mock;
};

function buildResponse(): MockResponse {
  return { sendStatus: jest.fn() };
}

describe("POST /paypal/hooks", () => {
  it("is source-discoverable and delegates a valid JSON webhook to the existing handler/event path", async () => {
    expect(POST).toBeDefined();

    const body = {
      id: "WH-1",
      event_type: "CHECKOUT.ORDER.APPROVED",
      resource_type: "checkout-order",
      resource: { id: "ORDER-1" },
    };
    const req = {
      body,
      headers: {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.paypal.com/cert",
        "paypal-transmission-id": "transmission-1",
        "paypal-transmission-sig": "signature-1",
        "paypal-transmission-time": "2026-09-29T10:00:00Z",
      },
      scope: { resolve: jest.fn() },
    };
    const res = buildResponse();

    (paypalWebhookHandler as jest.Mock).mockImplementationOnce(async (handlerReq, handlerRes) => {
      expect(handlerReq.body).toBe(body);
      await handlerReq.scope.resolve("eventBusService").emit(
        "medusa.paypal_webhook_received",
        handlerReq.body,
        { delay: 5000, attempts: 3 },
      );
      handlerRes.sendStatus(200);
    });

    const emit = jest.fn(async () => undefined);
    req.scope.resolve = jest.fn((name: string) => {
      if (name === "eventBusService") return { emit };
      throw new Error(`Unexpected dependency: ${name}`);
    });

    await POST(req as any, res as any);

    expect(paypalWebhookHandler).toHaveBeenCalledWith(req, res);
    expect(emit).toHaveBeenCalledWith("medusa.paypal_webhook_received", body, {
      delay: 5000,
      attempts: 3,
    });
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  it.each([
    [401, "signature verification"],
    [409, "handler processing"],
  ])("passes through %i for %s", async (status) => {
    (paypalWebhookHandler as jest.Mock).mockImplementationOnce(async (_req, response) => {
      response.sendStatus(status);
    });
    const res = buildResponse();

    await POST({ body: {}, scope: { resolve: jest.fn() } } as any, res as any);

    expect(res.sendStatus).toHaveBeenCalledWith(status);
  });
});
