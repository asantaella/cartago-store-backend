import { GET } from "./route";

const makeResponse = () =>
  ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  }) as any;

const makeRequest = (query: Record<string, unknown>) => {
  const customerRepository = {
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  };
  const manager = {
    withRepository: jest.fn().mockReturnValue(customerRepository),
  };

  return {
    req: {
      query,
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === "manager") {
            return manager;
          }

          throw new Error(`Unexpected dependency: ${name}`);
        }),
      },
    } as any,
    customerRepository,
  };
};

describe("GET /admin/customers", () => {
  it("filters customers by an explicit blacklist boolean", async () => {
    const { req, customerRepository } = makeRequest({
      in_black_list: "false",
      offset: "0",
      limit: "15",
    });
    const res = makeResponse();

    await GET(req, res);

    expect(customerRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ in_black_list: false }),
      }),
    );
  });

  it("rejects invalid blacklist filter values", async () => {
    const { req } = makeRequest({ in_black_list: "sometimes" });
    const res = makeResponse();

    await expect(GET(req, res)).rejects.toMatchObject({ type: "invalid_data" });
  });
});
