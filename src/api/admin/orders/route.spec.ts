import { GET } from "./route";

const makeResponse = () =>
  ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  }) as any;

const makeRequest = (query: Record<string, unknown>) => {
  const orderRepository = {
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  };
  const customerRepository = {
    find: jest.fn().mockResolvedValue([]),
  };
  const manager = {
    getRepository: jest.fn().mockReturnValue(orderRepository),
    withRepository: jest.fn().mockReturnValue(customerRepository),
  };
  const orderService = {
    retrieveWithTotals: jest.fn(),
  };

  return {
    req: {
      query,
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === "manager") return manager;
          if (name === "orderService") return orderService;
          throw new Error(`Unexpected dependency: ${name}`);
        }),
      },
    } as any,
    orderRepository,
  };
};

describe("GET /admin/orders", () => {
  it("uses distinct bindings for normalized predicates in a multi-term search", async () => {
    const { req, orderRepository } = makeRequest({ q: "Pablo Ortuño" });
    const res = makeResponse();

    await GET(req, res);

    const query = orderRepository.find.mock.calls[0][0];
    const normalizedPredicates = [
      query.where[0].shipping_address.first_name,
      query.where[1].shipping_address.last_name,
      query.where[5].customer.first_name,
      query.where[6].customer.last_name,
      query.where[8].shipping_address.first_name,
      query.where[8].shipping_address.last_name,
      query.where[9].customer.first_name,
      query.where[9].customer.last_name,
    ] as any[];

    expect(normalizedPredicates.every((predicate) => predicate.type === "raw")).toBe(
      true,
    );
    expect(
      normalizedPredicates.map(
        (predicate) => Object.values(predicate.objectLiteralParameters)[0],
      ),
    ).toEqual([
      "%pabloortuno%",
      "%pabloortuno%",
      "%pabloortuno%",
      "%pabloortuno%",
      "%pablo%",
      "%ortuno%",
      "%pablo%",
      "%ortuno%",
    ]);

    const placeholderNames = normalizedPredicates.map(
      (predicate) => Object.keys(predicate.objectLiteralParameters)[0],
    );
    expect(new Set(placeholderNames).size).toBe(normalizedPredicates.length);
    normalizedPredicates.forEach((predicate) => {
      expect(predicate.getSql("name")).toContain(`:${Object.keys(predicate.objectLiteralParameters)[0]}`);
    });
  });
});
