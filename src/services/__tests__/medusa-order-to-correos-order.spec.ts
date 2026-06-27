/// <reference types="jest" />

import { MedusaOrderToCorreosOrderMapper } from "../mappers/medusa-order-to-correos-order";
import {
  CORREOS_SHIPMENT_CONSTANTS,
  CORREOS_PACKAGE_CONSTANTS,
  CORREOS_PACKAGE_CONTENTS_CONSTANTS,
  CORREOS_CUSTOMS_DATA_CONSTANTS,
  CORREOS_ADDRESSEE_CONSTANTS,
  CORREOS_SENDER_CONSTANTS,
  TARIFF_NUMBER,
} from "../../constants/correos-constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REQUIRED_ENV_VARS = {
  CORREOS_CONTRACT_NUMBER: "123456",
  CORREOS_CLIENT_NUMBER: "CLIENT01",
  CORREOS_LABELLER_CODE: "LAB001",
  CORREOS_PRODUCT: "PAFXB",
  CORREOS_DELIVERY_METHOD: "DOUAOF",
  CORREOS_ADMISSION_PROVINCE: "30",
};

function setRequiredEnv(): void {
  Object.entries(REQUIRED_ENV_VARS).forEach(([key, val]) => {
    process.env[key] = val;
  });
}

function clearRequiredEnv(): void {
  Object.keys(REQUIRED_ENV_VARS).forEach((key) => {
    delete process.env[key];
  });
}

// ── Shared mock-data creators ────────────────────────────────────────────

const BASE_METADATA = {
  address_province_code: "28",
  weight: 500,
  length: 200,
  width: 150,
  height: 100,
};

function createDefaultOrder(): any {
  return {
    display_id: 1001,
    email: "cliente@example.com",
    shipping_address: {
      first_name: "Juan",
      last_name: "Pérez",
      address_1: "Calle Mayor 10",
      city: "Madrid",
      postal_code: "28001",
      phone: "612345678",
      country_code: "ES",
      metadata: { ...BASE_METADATA },
    },
    items: [
      {
        title: "Producto A",
        quantity: 2,
        unit_price: 2500,
        variant: { weight: 120 },
      },
    ],
  };
}

/**
 * Shallow-merge overrides into the default order.
 * For nested objects (shipping_address, items[]), COMPLETELY replaces them
 * if present in overrides — no automatic deep-merge of defaults.
 *
 * Tests that want partial overrides should use mergeShippingAddress /
 * mergeItems helpers below.
 */
function buildMockOrder(overrides?: Record<string, any>): any {
  if (!overrides) return createDefaultOrder();
  return { ...createDefaultOrder(), ...overrides };
}

/**
 * Return a default order whose shipping_address.metadata is replaced entirely.
 */
function orderWithMetadata(meta: Record<string, any>): any {
  const order = createDefaultOrder();
  order.shipping_address.metadata = meta;
  return order;
}

/**
 * Return a default order with custom items (no automatic variant defaults).
 */
function orderWithItems(items: any[]): any {
  return {
    ...createDefaultOrder(),
    items,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("MedusaOrderToCorreosOrderMapper", () => {
  let mapper: MedusaOrderToCorreosOrderMapper;

  beforeAll(() => {
    setRequiredEnv();
  });

  afterAll(() => {
    clearRequiredEnv();
  });

  beforeEach(() => {
    mapper = new MedusaOrderToCorreosOrderMapper();
  });

  // ────────────────────────────────────────────────────────────────────────
  // Constructor — env validation
  // ────────────────────────────────────────────────────────────────────────

  describe("constructor validation", () => {
    it("constructs successfully when all env vars are set", () => {
      expect(mapper).toBeInstanceOf(MedusaOrderToCorreosOrderMapper);
    });

    it("throws if CORREOS_CONTRACT_NUMBER is missing", () => {
      delete process.env.CORREOS_CONTRACT_NUMBER;
      expect(() => new MedusaOrderToCorreosOrderMapper()).toThrow(
        /CORREOS_CONTRACT_NUMBER/,
      );
      process.env.CORREOS_CONTRACT_NUMBER =
        REQUIRED_ENV_VARS.CORREOS_CONTRACT_NUMBER;
    });

    it("throws if CORREOS_CLIENT_NUMBER is missing", () => {
      delete process.env.CORREOS_CLIENT_NUMBER;
      expect(() => new MedusaOrderToCorreosOrderMapper()).toThrow(
        /CORREOS_CLIENT_NUMBER/,
      );
      process.env.CORREOS_CLIENT_NUMBER =
        REQUIRED_ENV_VARS.CORREOS_CLIENT_NUMBER;
    });

    it("throws if multiple env vars are missing", () => {
      clearRequiredEnv();
      expect(() => new MedusaOrderToCorreosOrderMapper()).toThrow(
        /CORREOS_CONTRACT_NUMBER, CORREOS_CLIENT_NUMBER/,
      );
      setRequiredEnv();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // transform — input validation
  // ────────────────────────────────────────────────────────────────────────

  describe("transform — input validation", () => {
    it("throws when order is null", () => {
      expect(() => mapper.transform(null as any)).toThrow("Order is required");
    });

    it("throws when order is undefined", () => {
      expect(() => mapper.transform(undefined as any)).toThrow(
        "Order is required",
      );
    });

    it("throws when order has no shipping_address", () => {
      expect(() =>
        mapper.transform(buildMockOrder({ shipping_address: null })),
      ).toThrow("Order must have a shipping address");
    });

    it("throws when order has no items", () => {
      expect(() =>
        mapper.transform(buildMockOrder({ items: null })),
      ).toThrow("Order must have at least one item");
    });

    it("throws when order has empty items", () => {
      expect(() =>
        mapper.transform(buildMockOrder({ items: [] })),
      ).toThrow("Order must have at least one item");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // transform — happy path
  // ────────────────────────────────────────────────────────────────────────

  describe("transform — full mapping", () => {
    it("returns a PreregisterDto with the correct top-level structure", () => {
      const result = mapper.transform(buildMockOrder());

      expect(result).toEqual({
        errorCodeLanguage: "spa",
        shipments: [expect.any(Object)],
      });
      expect(result.shipments).toHaveLength(1);
    });

    it("maps shipment-level fields from env config", () => {
      const result = mapper.transform(buildMockOrder());
      const shipment = result.shipments[0];

      expect(shipment.admissionProvince).toBe("30");
      expect(shipment.contractNumber).toBe("123456");
      expect(shipment.clientNumber).toBe("CLIENT01");
      expect(shipment.labellerCode).toBe("LAB001");
      expect(shipment.product).toBe("PAFXB");
      expect(shipment.deliveryMethod).toBe("DOUAOF");
      expect(shipment.packagesNumber).toBe(
        CORREOS_SHIPMENT_CONSTANTS.PACKAGES_NUMBER,
      );
      expect(shipment.modificationType).toBe(
        CORREOS_SHIPMENT_CONSTANTS.MODIFICATION_TYPE,
      );
    });

    it("reads shipment dimensions from shipping_address metadata", () => {
      const order = orderWithMetadata({
        weight: 1200,
        length: 350,
        width: 250,
        height: 180,
      });
      const result = mapper.transform(order);
      const shipment = result.shipments[0];

      expect(shipment.totalWeight).toBe("1200");
      expect(shipment.totalLength).toBe("350");
      expect(shipment.totalWidth).toBe("250");
      expect(shipment.totalHigh).toBe("180");
    });

    it("falls back to empty string for missing metadata dimensions", () => {
      const order = orderWithMetadata({});
      const result = mapper.transform(order);
      const shipment = result.shipments[0];

      expect(shipment.totalWeight).toBe("");
      expect(shipment.totalLength).toBe("");
      expect(shipment.totalWidth).toBe("");
      expect(shipment.totalHigh).toBe("");
    });

    it("falls back to default package dimensions when metadata dimensions are missing", () => {
      const order = orderWithMetadata({});
      const result = mapper.transform(order);
      const pkg = result.shipments[0].packages[0];

      expect(pkg.packageHeight).toBe(CORREOS_PACKAGE_CONSTANTS.DEFAULT_HEIGHT);
      expect(pkg.packageWidth).toBe(CORREOS_PACKAGE_CONSTANTS.DEFAULT_WIDTH);
      expect(pkg.packageLength).toBe(CORREOS_PACKAGE_CONSTANTS.DEFAULT_LENGTH);
    });

    it("uses metadata dimensions for package when available", () => {
      const order = orderWithMetadata({
        height: 200,
        width: 150,
        length: 300,
      });
      const result = mapper.transform(order);
      const pkg = result.shipments[0].packages[0];

      expect(pkg.packageHeight).toBe("200");
      expect(pkg.packageWidth).toBe("150");
      expect(pkg.packageLength).toBe("300");
      // weight is not in metadata → empty string from fallback
      expect(pkg.packageWeightGrams).toBe("");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Sender mapping
  // ────────────────────────────────────────────────────────────────────────

  describe("sender mapping", () => {
    it("maps sender fields from CORREOS_SENDER_CONSTANTS", () => {
      const result = mapper.transform(buildMockOrder());
      const sender = result.shipments[0].sender;

      expect(sender.company).toBe(CORREOS_SENDER_CONSTANTS.COMPANY);
      expect(sender.doiNumber).toBe(CORREOS_SENDER_CONSTANTS.DOI_NUMBER);
      expect(sender.address).toBe(CORREOS_SENDER_CONSTANTS.ADDRESS);
      expect(sender.number).toBe(CORREOS_SENDER_CONSTANTS.NUMBER);
      expect(sender.locality).toBe(CORREOS_SENDER_CONSTANTS.LOCALITY);
      expect(sender.province).toBe(CORREOS_SENDER_CONSTANTS.PROVINCE);
      expect(sender.cp).toBe(CORREOS_SENDER_CONSTANTS.CP);
      expect(sender.country).toBe(CORREOS_SENDER_CONSTANTS.COUNTRY);
      expect(sender.contactPhone).toBe(CORREOS_SENDER_CONSTANTS.CONTACT_PHONE);
      expect(sender.email).toBe(CORREOS_SENDER_CONSTANTS.EMAIL);
      expect(sender.language).toBe(CORREOS_SENDER_CONSTANTS.LANGUAGE);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Addressee mapping
  // ────────────────────────────────────────────────────────────────────────

  describe("addressee mapping", () => {
    it("maps shipping address fields to addressee", () => {
      const result = mapper.transform(buildMockOrder());
      const addressee = result.shipments[0].addressee;

      expect(addressee.name).toBe("Juan");
      expect(addressee.lastName1).toBe("Pérez");
      expect(addressee.address).toBe("Calle Mayor 10");
      expect(addressee.locality).toBe("Madrid");
      expect(addressee.cp).toBe("28001");
      expect(addressee.country).toBe(CORREOS_ADDRESSEE_CONSTANTS.COUNTRY);
      expect(addressee.language).toBe(CORREOS_ADDRESSEE_CONSTANTS.LANGUAGE);
      expect(addressee.email).toBe("cliente@example.com");
    });

    it("maps province from metadata address_province_code", () => {
      const order = orderWithMetadata({ address_province_code: "28" });
      const result = mapper.transform(order);
      expect(result.shipments[0].addressee.province).toBe("28");
    });

    it("falls back to empty province when metadata is missing address_province_code", () => {
      const order = orderWithMetadata({});
      const result = mapper.transform(order);
      expect(result.shipments[0].addressee.province).toBe("");
    });

    it("sets contactPhone from shipping_address phone", () => {
      const result = mapper.transform(
        buildMockOrder({
          shipping_address: {
            ...createDefaultOrder().shipping_address,
            phone: "651513391",
          },
        }),
      );
      expect(result.shipments[0].addressee.contactPhone).toBe("651513391");
    });

    it("sets email from order.email", () => {
      const result = mapper.transform(buildMockOrder({ email: "comprador@test.com" }));
      expect(result.shipments[0].addressee.email).toBe("comprador@test.com");
    });

    it("trims whitespace from address fields", () => {
      const order = buildMockOrder({
        shipping_address: {
          ...createDefaultOrder().shipping_address,
          first_name: "  Ana  ",
          last_name: "  López  ",
          address_1: "  Av. Ruiz  ",
          city: "  Valencia  ",
          postal_code: "  46001  ",
        },
      });
      const result = mapper.transform(order);
      const addressee = result.shipments[0].addressee;

      expect(addressee.name).toBe("Ana");
      expect(addressee.lastName1).toBe("López");
      expect(addressee.address).toBe("Av. Ruiz");
      expect(addressee.locality).toBe("Valencia");
      expect(addressee.cp).toBe("46001");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // smsNumber from isMobilePhone
  // ────────────────────────────────────────────────────────────────────────

  describe("smsNumber", () => {
    it("sets smsNumber to sanitized phone when the number is a mobile in the given country", () => {
      const result = mapper.transform(
        buildMockOrder({
          shipping_address: {
            ...createDefaultOrder().shipping_address,
            phone: "612345678",
            country_code: "ES",
          },
        }),
      );
      expect(result.shipments[0].addressee.smsNumber).toBe("612345678");
    });

    it("sets smsNumber to empty when the number is NOT a mobile for the given country", () => {
      const result = mapper.transform(
        buildMockOrder({
          shipping_address: {
            ...createDefaultOrder().shipping_address,
            phone: "912345678",
            country_code: "ES",
          },
        }),
      );
      expect(result.shipments[0].addressee.smsNumber).toBe("");
    });

    it("does NOT treat +34-prefixed ES numbers as mobile (isMobilePhone strips +, leaving 34…) ", () => {
      const result = mapper.transform(
        buildMockOrder({
          shipping_address: {
            ...createDefaultOrder().shipping_address,
            phone: "+34612345678",
            country_code: "ES",
          },
        }),
      );
      // isMobilePhone("+34612345678", "ES") → strips + → "34612345678" → doesn't start with 6|7
      expect(result.shipments[0].addressee.smsNumber).toBe("");
    });

    it("does NOT treat +351-prefixed PT numbers as mobile (isMobilePhone strips +, leaving 351…)", () => {
      const result = mapper.transform(
        buildMockOrder({
          shipping_address: {
            ...createDefaultOrder().shipping_address,
            phone: "+351911234567",
            country_code: "PT",
          },
        }),
      );
      expect(result.shipments[0].addressee.smsNumber).toBe("");
    });

    it("accepts national-format mobile number with spaces for smsNumber", () => {
      const result = mapper.transform(
        buildMockOrder({
          shipping_address: {
            ...createDefaultOrder().shipping_address,
            phone: "612 345 678",
            country_code: "ES",
          },
        }),
      );
      // isMobilePhone normalizes spaces → "612345678" → valid ES mobile
      // sanitizePhoneNumber removes +XX (none) and spaces → "612345678"
      expect(result.shipments[0].addressee.smsNumber).toBe("612345678");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Package mapping
  // ────────────────────────────────────────────────────────────────────────

  describe("package mapping", () => {
    it("uses first item title as packageId", () => {
      const order = orderWithItems([{ title: "Caja de Filtros", quantity: 1, unit_price: 1000 }]);
      const result = mapper.transform(order);
      expect(result.shipments[0].packages[0].packageId).toBe("Caja de Filtros");
    });

    it("uses item title even when empty (the Order X fallback only triggers for zero items, which is blocked by validation)", () => {
      const order = orderWithItems([{ title: "", quantity: 1, unit_price: 1000 }]);
      const result = mapper.transform(order);
      // The ternary: items.length > 0 ? items[0].title : `Order ${display_id}`
      // Since items exist, the title "" is used as-is
      expect(result.shipments[0].packages[0].packageId).toBe("");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Customs data & package contents
  // ────────────────────────────────────────────────────────────────────────

  describe("customs data", () => {
    it("maps each order item to a customs data entry", () => {
      const order = orderWithItems([
        { title: "Filtro Aceite", quantity: 2, unit_price: 1500 },
        { title: "Filtro Aire", quantity: 1, unit_price: 2500 },
      ]);
      const result = mapper.transform(order);
      const customsData = result.shipments[0].packages[0].packageContents
        .customsData;

      expect(customsData).toHaveLength(2);

      expect(customsData[0]).toEqual({
        quantity: "2",
        description: "Filtro Aceite",
        netWeight: "10", // fallback weight (no variant data)
        netValue: "15.00",
        tariffNumber: TARIFF_NUMBER,
        countryOrigin: CORREOS_CUSTOMS_DATA_CONSTANTS.COUNTRY_ORIGIN,
      });

      expect(customsData[1]).toEqual({
        quantity: "1",
        description: "Filtro Aire",
        netWeight: "10",
        netValue: "25.00",
        tariffNumber: TARIFF_NUMBER,
        countryOrigin: CORREOS_CUSTOMS_DATA_CONSTANTS.COUNTRY_ORIGIN,
      });
    });

    it("uses variant weight when available for netWeight", () => {
      const order = orderWithItems([
        {
          title: "Filtro Aceite",
          quantity: 1,
          unit_price: 1500,
          variant: { weight: 350 },
        },
      ]);
      const result = mapper.transform(order);
      const cd = result.shipments[0].packages[0].packageContents.customsData[0];

      expect(cd.netWeight).toBe("350");
    });

    it("falls back to 10 when variant has no weight", () => {
      const order = orderWithItems([
        {
          title: "Filtro",
          quantity: 1,
          unit_price: 1000,
          variant: { weight: null },
        },
      ]);
      const result = mapper.transform(order);
      const cd = result.shipments[0].packages[0].packageContents.customsData[0];

      expect(cd.netWeight).toBe("10");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Static constants in the output
  // ────────────────────────────────────────────────────────────────────────

  describe("static Correos constants", () => {
    it("uses CORREOS_PACKAGE_CONTENTS_CONSTANTS for package contents", () => {
      const result = mapper.transform(buildMockOrder());
      const pc = result.shipments[0].packages[0].packageContents;

      expect(pc.shipmentType).toBe(
        CORREOS_PACKAGE_CONTENTS_CONSTANTS.SHIPMENT_TYPE,
      );
      expect(pc.instructionsDoNotDeliver).toBe(
        CORREOS_PACKAGE_CONTENTS_CONSTANTS.INSTRUCTIONS_DO_NOT_DELIVER,
      );
      expect(pc.invoiceNumber).toBe("");
      expect(pc.licenseNumber).toBe("");
    });
  });
});
