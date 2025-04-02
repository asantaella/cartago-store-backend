import {
  getCustomerNifCif,
  getShippingMethodName,
  buildShippingMethodCsv,
} from "../order-utils";
import { Order, ShippingMethod, ShippingOption } from "@medusajs/medusa";

describe("Order Utilities", () => {
  describe("getCustomerNifCif", () => {
    it("extrae el NIF/CIF de los metadatos de la dirección de envío", () => {
      const order = {
        shipping_address: {
          metadata: {
            nif_cif: "12345678Z",
          },
        },
      } as unknown as Order;

      expect(getCustomerNifCif(order)).toBe("12345678Z");
    });

    it("extrae el NIF/CIF de los metadatos de la dirección de facturación si no está en la de envío", () => {
      const order = {
        shipping_address: {
          metadata: {},
        },
        billing_address: {
          metadata: {
            nif_cif: "B12345678",
          },
        },
      } as unknown as Order;

      expect(getCustomerNifCif(order)).toBe("B12345678");
    });

    it("devuelve undefined si no hay NIF/CIF en ninguna dirección", () => {
      const order = {
        shipping_address: {
          metadata: {},
        },
        billing_address: {
          metadata: {},
        },
      } as unknown as Order;

      expect(getCustomerNifCif(order)).toBeUndefined();
    });

    it("maneja pedidos falsy", () => {
      expect(getCustomerNifCif(null as any)).toBeUndefined();
      expect(getCustomerNifCif(undefined as any)).toBeUndefined();
    });
  });

  describe("getShippingMethodName", () => {
    it("extrae el nombre del método de envío", () => {
      const order = {
        shipping_methods: [
          {
            shipping_option: {
              name: "Envío Estándar",
            },
          },
        ],
      } as unknown as Order;

      expect(getShippingMethodName(order)).toBe("Envío Estándar");
    });

    it("devuelve cadena vacía si no hay métodos de envío", () => {
      const order = {
        shipping_methods: [],
      } as unknown as Order;

      expect(getShippingMethodName(order)).toBe("");
    });

    it("maneja pedidos falsy", () => {
      expect(getShippingMethodName(null as any)).toBe("");
      expect(getShippingMethodName(undefined as any)).toBe("");
    });
  });

  describe("buildShippingMethodCsv", () => {
    it("genera correctamente la línea CSV para el método de envío", () => {
      const order = {
        region: {
          tax_rate: 21,
        },
        currency_code: "EUR",
        shipping_methods: [
          {
            shipping_option: {
              name: "Envío Estándar",
            },
            price: 595,
            total: 595,
          },
        ],
      } as unknown as Order;

      const result = buildShippingMethodCsv(order);
      expect(result).toBe("Envío Estándar;;1;4,92 €;5,95 €;4,92 €;0;5,95 €;;");
    });

    it("maneja métodos de envío con valores cero", () => {
      const order = {
        shipping_methods: [
          {
            shipping_option: {
              name: "Envío Gratuito",
            },
            price: 0,
            total: 0,
          },
        ],
      } as unknown as Order;

      const result = buildShippingMethodCsv(order);
      expect(result).toBe("Envío Gratuito;;1;0;0;0;0");
    });

    it("maneja pedidos sin métodos de envío", () => {
      const order = {
        shipping_methods: [],
      } as unknown as Order;

      const result = buildShippingMethodCsv(order);
      expect(result).toBe(";;1;0;0;0;0");
    });

    it("maneja pedidos falsy", () => {
      expect(buildShippingMethodCsv(null as any)).toBe(";;1;0;0;0;0");
      expect(buildShippingMethodCsv(undefined as any)).toBe(";;1;0;0;0;0");
    });
  });
});
