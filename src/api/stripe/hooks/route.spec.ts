import { POST } from "./route";
import { config as middlewareConfig } from "../../middlewares";

type MockResponse = {
  status: jest.Mock;
  send: jest.Mock;
  sendStatus: jest.Mock;
};

function buildResponse(): MockResponse {
  const response = {} as MockResponse;
  response.status = jest.fn(() => response);
  response.send = jest.fn(() => response);
  response.sendStatus = jest.fn(() => response);
  return response;
}

describe("POST /stripe/hooks", () => {
  it("is source-discoverable, preserves the raw body, verifies, and emits the Stripe event", async () => {
    expect(POST).toBeDefined();
    expect(
      middlewareConfig.routes?.find((route) => route.matcher === "/stripe/hooks"),
    ).toMatchObject({ matcher: "/stripe/hooks", bodyParser: false });

    const rawBody = Buffer.from('{"id":"evt_1"}');
    const event = {
      id: "evt_1",
      type: "payment_intent.processing",
    };
    const constructWebhookEvent = jest.fn(() => event);
    const emit = jest.fn(async () => undefined);
    const req = {
      body: rawBody,
      headers: { "stripe-signature": "sig_1" },
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === "stripeProviderService") {
            return {
              options: { webhook_delay: 1200, webhook_retries: 5 },
              constructWebhookEvent,
            };
          }
          if (name === "eventBusService") return { emit };
          throw new Error(`Unexpected dependency: ${name}`);
        }),
      },
    };
    const res = buildResponse();

    await POST(req as any, res as any);

    expect(constructWebhookEvent).toHaveBeenCalledWith(rawBody, "sig_1");
    expect(emit).toHaveBeenCalledWith("medusa.stripe_payment_intent_update", event, {
      delay: 1200,
      attempts: 5,
    });
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  it("returns 400 when Stripe rejects the signature", async () => {
    const signatureError = new Error("invalid signature");
    const constructWebhookEvent = jest.fn(() => {
      throw signatureError;
    });
    const emit = jest.fn();
    const req = {
      body: Buffer.from("{}"),
      headers: { "stripe-signature": "bad" },
      scope: {
        resolve: jest.fn((name: string) =>
          name === "stripeProviderService"
            ? { constructWebhookEvent, options: {} }
            : { emit },
        ),
      },
    };
    const res = buildResponse();

    await POST(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith("Webhook Error: invalid signature");
    expect(emit).not.toHaveBeenCalled();
  });
});
