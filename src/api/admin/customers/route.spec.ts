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

  it("normalizes accents when searching customer names", async () => {
    const searchText = "Ortuño".normalize("NFD");
    const { req, customerRepository } = makeRequest({ q: searchText });
    const res = makeResponse();

    await GET(req, res);

    const query = customerRepository.find.mock.calls[0][0];
    const nameSearch = query.where[2].last_name as any;

    expect(nameSearch.type).toBe("raw");
    expect(nameSearch.objectLiteralParameters).toEqual({
      normalizedValue: "%ortuno%",
    });
  });

  it("passes TypeORM pagination with expanded relations and ordering", async () => {
    const { req, customerRepository } = makeRequest({
      expand: "orders,groups",
      offset: "15",
      limit: "15",
      order: "-created_at",
    });
    const res = makeResponse();

    await GET(req, res);

    expect(customerRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: { orders: true, groups: true },
        order: { created_at: "DESC" },
        skip: 15,
        take: 15,
      }),
    );
  });

  it("matches given name and surname together for a two-word query", async () => {
    const { req, customerRepository } = makeRequest({ q: "Pablo Ortuño" });
    const res = makeResponse();

    await GET(req, res);

    const query = customerRepository.find.mock.calls[0][0] as any;
    const namePair = query.where.find((where: Record<string, any>) => {
      const firstName = where.first_name;
      const lastName = where.last_name;

      return (
        firstName?.type === "raw" &&
        lastName?.type === "raw" &&
        Object.values(firstName.objectLiteralParameters).includes("%pablo%") &&
        Object.values(lastName.objectLiteralParameters).includes("%ortuno%")
      );
    });

    expect(namePair).toBeDefined();
    expect(namePair.first_name).toEqual(
      expect.objectContaining({ type: "raw" }),
    );
    expect(namePair.last_name).toEqual(
      expect.objectContaining({ type: "raw" }),
    );
    expect(
      Object.keys(namePair.first_name.objectLiteralParameters).filter((key) =>
        Object.prototype.hasOwnProperty.call(
          namePair.last_name.objectLiteralParameters,
          key,
        ),
      ),
    ).toEqual([]);
  });

  it("matches contiguous given names and surnames for a compound query", async () => {
    const { req, customerRepository } = makeRequest({
      q: "Pablo José Ortuño García",
    });
    const res = makeResponse();

    await GET(req, res);

    const query = customerRepository.find.mock.calls[0][0] as any;
    const namePair = query.where.find((where: Record<string, any>) => {
      const firstName = where.first_name;
      const lastName = where.last_name;

      return (
        firstName?.type === "raw" &&
        lastName?.type === "raw" &&
        Object.values(firstName.objectLiteralParameters).includes(
          "%pablo jose%",
        ) &&
        Object.values(lastName.objectLiteralParameters).includes(
          "%ortuno garcia%",
        )
      );
    });

    expect(namePair).toBeDefined();
    expect(namePair.first_name).toEqual(
      expect.objectContaining({ type: "raw" }),
    );
    expect(namePair.last_name).toEqual(
      expect.objectContaining({ type: "raw" }),
    );
    expect(
      Object.keys(namePair.first_name.objectLiteralParameters).filter((key) =>
        Object.prototype.hasOwnProperty.call(
          namePair.last_name.objectLiteralParameters,
          key,
        ),
      ),
    ).toEqual([]);
  });

  it("rejects invalid blacklist filter values", async () => {
    const { req } = makeRequest({ in_black_list: "sometimes" });
    const res = makeResponse();

    await expect(GET(req, res)).rejects.toMatchObject({ type: "invalid_data" });
  });
});
