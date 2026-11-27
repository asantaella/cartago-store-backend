import { GET, isValidDay } from "../route";

const buildRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const EMPTY_SUMMARY = { count: 0, units: 0, amounts: [] };

const buildReq = (
  query: Record<string, unknown>,
  listByDate = jest.fn().mockResolvedValue({ sold: [], summary: EMPTY_SUMMARY }),
) => ({
  query,
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

    await GET(buildReq({ date: "nope" }) as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ type: "invalid_data" }),
    );
  });

  it("lists one page for the day with the whole-day summary and paging", async () => {
    const summary = { count: 7, units: 9, amounts: [{ currency_code: "eur", amount: 5000 }] };
    const listByDate = jest
      .fn()
      .mockResolvedValue({ sold: [{ line_item_id: "li_1" }], summary });
    const res = buildRes();

    await GET(buildReq({ date: "2026-11-27", limit: "5", offset: "10" }, listByDate) as any, res);

    expect(listByDate).toHaveBeenCalledWith("2026-11-27", { limit: 5, offset: 10 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      sold: [{ line_item_id: "li_1" }],
      count: 7,
      summary,
      limit: 5,
      offset: 10,
      date: "2026-11-27",
    });
  });

  it("defaults to 20 rows from the start and clamps the limit to 100", async () => {
    const listByDate = jest.fn().mockResolvedValue({ sold: [], summary: EMPTY_SUMMARY });

    await GET(buildReq({ date: "2026-11-27" }, listByDate) as any, buildRes());
    expect(listByDate).toHaveBeenLastCalledWith("2026-11-27", { limit: 20, offset: 0 });

    await GET(buildReq({ date: "2026-11-27", limit: "500", offset: "-3" }, listByDate) as any, buildRes());
    expect(listByDate).toHaveBeenLastCalledWith("2026-11-27", { limit: 100, offset: 0 });
  });
});
