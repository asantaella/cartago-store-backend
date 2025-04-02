import { formatMoney, formatDate, formatAddress } from "../format-utils";
import { Address } from "@medusajs/medusa";

describe("Format Utilities", () => {
  describe("formatMoney", () => {
    it("formatea correctamente cantidades monetarias en euros", () => {
      expect(formatMoney(1099, "EUR")).toBe("10,99 €");
      expect(formatMoney(1000, "EUR")).toBe("10,00 €");
      expect(formatMoney(1, "EUR")).toBe("0,01 €");
      expect(formatMoney(0, "EUR")).toBe("0,00 €");
    });

    it("formatea correctamente cantidades monetarias en dólares", () => {
      expect(formatMoney(1099, "USD")).toBe("10,99 $");
      expect(formatMoney(1000, "USD")).toBe("10,00 $");
    });

    it("maneja correctamente grandes cantidades", () => {
      expect(formatMoney(100050, "EUR")).toBe("1.000,50 €");
      expect(formatMoney(1000050, "EUR")).toBe("10.000,50 €");
    });

    it("maneja valores falsy", () => {
      expect(formatMoney(0, "EUR")).toBe("0,00 €");
      expect(formatMoney(null as any, "EUR")).toBe("");
      expect(formatMoney(undefined as any, "EUR")).toBe("");
      expect(formatMoney(1099, null as any)).toBe("");
      expect(formatMoney(1099, "" as any)).toBe("");
    });

    it("maneja casos en los que el código de moneda está en minúscula", () => {
      expect(formatMoney(1099, "eur")).toBe("10,99 €");
      expect(formatMoney(1099, "usd")).toBe("10,99 $");
    });
  });

  describe("formatDate", () => {
    it("formatea correctamente fechas", () => {
      expect(formatDate(new Date("2023-05-15"))).toBe("15/5/2023");
      expect(formatDate(new Date("2023-01-01"))).toBe("1/1/2023");
      expect(formatDate(new Date("2023-12-31"))).toBe("31/12/2023");
    });

    it("maneja correctamente fechas con horas", () => {
      expect(formatDate(new Date("2023-05-15T14:30:00"))).toBe("15/5/2023");
    });
  });

  describe("formatAddress", () => {
    it("formatea correctamente una dirección completa", () => {
      const address: Partial<Address> = {
        address_1: "Calle Principal 123",
        address_2: "Piso 4B",
        city: "Madrid",
        province: "Madrid",
        postal_code: "28001",
      };

      expect(formatAddress(address as Address)).toBe(
        "Calle Principal 123 Piso 4B, Madrid, Madrid, 28001"
      );
    });

    it("maneja correctamente direcciones con campos vacíos", () => {
      const addressWithEmptyFields: Partial<Address> = {
        address_1: "Calle Principal 123",
        address_2: "",
        city: "Madrid",
        province: "Madrid",
        postal_code: "28001",
      };

      expect(formatAddress(addressWithEmptyFields as Address)).toBe(
        "Calle Principal 123 , Madrid, Madrid, 28001"
      );
    });

    it("maneja direcciones falsy", () => {
      expect(formatAddress(null as any)).toBe("");
      expect(formatAddress(undefined as any)).toBe("");
    });
  });
});
