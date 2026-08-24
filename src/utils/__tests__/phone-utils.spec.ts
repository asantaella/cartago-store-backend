/// <reference types="jest" />

import { isMobilePhone } from "../phone-utils";

describe("phone-utils", () => {
  describe("isMobilePhone", () => {
    // ── Guard clauses ─────────────────────────────────────────────────────

    it("returns false when phone is empty", () => {
      expect(isMobilePhone("", "ES")).toBe(false);
    });

    it("returns false when countryCode is empty", () => {
      expect(isMobilePhone("612345678", "")).toBe(false);
    });

    it("returns false when both are empty", () => {
      expect(isMobilePhone("", "")).toBe(false);
    });

    // ── Spain (ES) ────────────────────────────────────────────────────────

    describe("ES (Spain)", () => {
      it("accepts numbers starting with 6", () => {
        expect(isMobilePhone("612345678", "ES")).toBe(true);
      });

      it("accepts numbers starting with 7", () => {
        expect(isMobilePhone("712345678", "ES")).toBe(true);
      });

      it("rejects numbers starting with 5", () => {
        expect(isMobilePhone("512345678", "ES")).toBe(false);
      });

      it("rejects numbers starting with 8", () => {
        expect(isMobilePhone("812345678", "ES")).toBe(false);
      });

      it("rejects too-short numbers", () => {
        expect(isMobilePhone("61234567", "ES")).toBe(false);
      });

      it("rejects too-long numbers", () => {
        expect(isMobilePhone("6123456789", "ES")).toBe(false);
      });
    });

    // ── Portugal (PT) ─────────────────────────────────────────────────────

    describe("PT (Portugal)", () => {
      it("accepts 91 prefix", () => {
        expect(isMobilePhone("911234567", "PT")).toBe(true);
      });

      it("accepts 92 prefix", () => {
        expect(isMobilePhone("921234567", "PT")).toBe(true);
      });

      it("accepts 93 prefix", () => {
        expect(isMobilePhone("931234567", "PT")).toBe(true);
      });

      it("accepts 96 prefix", () => {
        expect(isMobilePhone("961234567", "PT")).toBe(true);
      });

      it("rejects 90 prefix", () => {
        expect(isMobilePhone("901234567", "PT")).toBe(false);
      });

      it("rejects 94 prefix", () => {
        expect(isMobilePhone("941234567", "PT")).toBe(false);
      });

      it("rejects 95 prefix", () => {
        expect(isMobilePhone("951234567", "PT")).toBe(false);
      });

      it("rejects too-short numbers", () => {
        expect(isMobilePhone("91123456", "PT")).toBe(false);
      });

      it("rejects too-long numbers", () => {
        expect(isMobilePhone("9112345678", "PT")).toBe(false);
      });

      it("rejects numbers starting with 9 but invalid third digit", () => {
        expect(isMobilePhone("980123456", "PT")).toBe(false);
      });
    });

    // ── France (FR) ───────────────────────────────────────────────────────

    describe("FR (France)", () => {
      it("accepts numbers starting with 6", () => {
        expect(isMobilePhone("612345678", "FR")).toBe(true);
      });

      it("accepts numbers starting with 7", () => {
        expect(isMobilePhone("712345678", "FR")).toBe(true);
      });

      it("rejects numbers starting with 5", () => {
        expect(isMobilePhone("512345678", "FR")).toBe(false);
      });
    });

    // ── Italy (IT) ────────────────────────────────────────────────────────

    describe("IT (Italy)", () => {
      it("accepts 33 prefix", () => {
        expect(isMobilePhone("331234567", "IT")).toBe(true);
      });

      it("accepts 34 prefix", () => {
        expect(isMobilePhone("341234567", "IT")).toBe(true);
      });

      it("accepts 39 prefix", () => {
        expect(isMobilePhone("391234567", "IT")).toBe(true);
      });

      it("rejects 30 prefix", () => {
        expect(isMobilePhone("301234567", "IT")).toBe(false);
      });

      it("accepts 32 prefix (3[1-9] matches 32)", () => {
        expect(isMobilePhone("321234567", "IT")).toBe(true);
      });

      it("rejects too-short numbers", () => {
        expect(isMobilePhone("33123456", "IT")).toBe(false);
      });

      it("rejects too-long numbers", () => {
        expect(isMobilePhone("3312345678", "IT")).toBe(false);
      });
    });

    // ── Unknown country code ──────────────────────────────────────────────

    it("returns false for unknown country codes", () => {
      expect(isMobilePhone("612345678", "DE")).toBe(false);
      expect(isMobilePhone("612345678", "UK")).toBe(false);
      expect(isMobilePhone("612345678", "AR")).toBe(false);
    });

    // ── Phone normalization ───────────────────────────────────────────────

    describe("phone normalization", () => {
      it("strips leading + from the number before matching", () => {
        // +612345678 → 612345678 → starts with 6 → valid ES
        expect(isMobilePhone("+612345678", "ES")).toBe(true);
      });

      it("strips spaces inside the number", () => {
        expect(isMobilePhone("612 345 678", "ES")).toBe(true);
      });

      it("strips both leading + and spaces", () => {
        // +61 234 5678 → +612345678 → 612345678 → starts with 6 → valid ES
        expect(isMobilePhone("+61 234 5678", "ES")).toBe(true);
      });

      it("does not treat a + country prefix as a valid number", () => {
        // +34612345678 → strips + → 34612345678 → starts with 34 → invalid for ES
        expect(isMobilePhone("+34612345678", "ES")).toBe(false);
      });
    });

    // ── Country code case insensitivity ───────────────────────────────────

    it("is case-insensitive for country codes", () => {
      expect(isMobilePhone("612345678", "es")).toBe(true);
      expect(isMobilePhone("911234567", "pt")).toBe(true);
      expect(isMobilePhone("612345678", "fr")).toBe(true);
      expect(isMobilePhone("331234567", "it")).toBe(true);
    });
  });
});
