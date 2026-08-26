import {
  isOrderInCustomerBlacklist,
  normalizeEmail,
  normalizeNifCif,
  normalizePhone,
} from "../customer-blacklist";

describe("customer blacklist matching", () => {
  it("normalizes identity values", () => {
    expect(normalizeEmail("  CUSTOMER@Example.COM ")).toBe("customer@example.com");
    expect(normalizePhone("+34 612-345-678")).toBe("34612345678");
    expect(normalizeNifCif(" b-123 456 78 ")).toBe("B12345678");
  });

  it("matches an order through its direct blacklisted customer", () => {
    expect(
      isOrderInCustomerBlacklist(
        { customer: { in_black_list: true } },
        [],
      ),
    ).toBe(true);
  });

  it("matches an order by normalized email", () => {
    expect(
      isOrderInCustomerBlacklist(
        { email: "buyer@example.com" },
        [{ email: " BUYER@EXAMPLE.COM " }],
      ),
    ).toBe(true);
  });

  it("matches an order by a Spanish phone with or without the country prefix", () => {
    expect(
      isOrderInCustomerBlacklist(
        {
          shipping_address: {
            country_code: "es",
            phone: "+34 612 345 678",
          },
        },
        [{ phone: "612345678" }],
      ),
    ).toBe(true);
  });

  it("matches an order by NIF/CIF in either address", () => {
    expect(
      isOrderInCustomerBlacklist(
        {
          billing_address: { metadata: { nif_cif: "B-12345678" } },
        },
        [{ metadata: { nif_cif: "b12345678" } }],
      ),
    ).toBe(true);
  });

  it("does not match empty identity values", () => {
    expect(
      isOrderInCustomerBlacklist(
        {
          email: "",
          shipping_address: { phone: "" },
          billing_address: { metadata: { nif_cif: "" } },
        },
        [{ email: "", phone: "", metadata: { nif_cif: "" } }],
      ),
    ).toBe(false);
  });
});
