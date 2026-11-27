import { GET, isValidDay } from "../route";

const buildRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const buildReq = (date: unknown, listByDate = jest.fn().mockResolvedValue([])) => ({
  query: { date },
  scope: { resolve: jest.fn(() => ({ listByDate })) },
});

describe("isValidDay", () => {
  it("accepts real calendar days and rejects anything else", () => {
    expect(isValidDay("2026-11-27")).toBe(true);
    expect(isValidDay("2026-02-29")).toBe(false);
    expect(isValidDay("2026-13-01")).toBe(false);
    expect(isValidDay("27/11/2026")).toBe(false);
    expect(isValidDay(undefined)).toBe(false);
  });
});

describe("GET /admin/sold-variants", () => {
  it("answers 400 when the date is missing or invalid", async () => {
    const res = buildRes();

    await GET(buildReq("nope") as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ type: "invalid_data" }),
    );
  });

  it("lists the sold rows for the requested day", async () => {
    const listByDate = jest.fn().mockResolvedValue([{ line_item_id: "li_1" }]);
    const res = buildRes();

    await GET(buildReq("2026-11-27", listByDate) as any, res);

    expect(listByDate).toHaveBeenCalledWith("2026-11-27");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      sold: [{ line_item_id: "li_1" }],
      count: 1,
      date: "2026-11-27",
    });
  });
});
