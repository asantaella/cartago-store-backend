import OrderSenderService from "../order-sender";
import {
  Order,
  LineItem,
  ShippingMethod,
  ShippingOption,
  Address,
  Discount,
} from "@medusajs/medusa";

// Mock de MailerSend
const mockSendEmail = jest.fn().mockResolvedValue(true);
jest.mock("mailersend", () => {
  return {
    MailerSend: jest.fn().mockImplementation(() => {
      return {
        email: {
          send: mockSendEmail,
        },
      };
    }),
    Recipient: jest.fn().mockImplementation((email, name) => ({ email, name })),
    EmailParams: jest.fn().mockImplementation(() => {
      return {
        setFrom: jest.fn().mockReturnThis(),
        setTo: jest.fn().mockReturnThis(),
        setTemplateId: jest.fn().mockReturnThis(),
        setPersonalization: jest.fn().mockReturnThis(),
        setAttachments: jest.fn().mockReturnThis(),
      };
    }),
  };
});

// Mock del entorno
process.env.MAILERSEND_API_KEY = "test-api-key";
process.env.MAILERSEND_SENDER_EMAIL = "test@cartago4x4.es";
process.env.MAILERSEND_SENDER_NAME = "Cartago 4x4 Test";
process.env.MAILERSEND_ORDER_PLACED_TEMPLATE_ID = "template-id-123";
process.env.MAILERSEND_ADMIN_EMAIL = "admin@cartago4x4.es";
process.env.MAILERSEND_COMPANY_NAME = "Cartago 4x4";

describe("OrderSenderService", () => {
  let orderSenderService: OrderSenderService;
  let mockOrder: Partial<Order>;
  let orderServiceMock: { retrieve: jest.Mock };

  beforeEach(() => {
    // Limpiamos los contadores de las llamadas a la función mock
    mockSendEmail.mockClear();

    // Creamos una instancia del servicio
    orderServiceMock = {
      retrieve: jest.fn(),
    };

    orderSenderService = new OrderSenderService(
      {
        orderService: orderServiceMock,
        manager: {},
      } as any,
      { sendgridApiKey: "test-api-key" }
    );

    // Espiar el método sendNotificationToAdmin
    jest
      .spyOn(orderSenderService as any, "sendNotificationToAdmin")
      .mockResolvedValue({
        to: "admin@cartago4x4.es",
        status: "sent",
        data: {},
      });

    // Mock completo de Order
    mockOrder = {
      id: "order_123456",
      display_id: 12345,
      email: "cliente@ejemplo.com",
      created_at: new Date("2023-05-15"),
      currency_code: "eur",

      // Datos financieros
      subtotal: 28990,
      shipping_total: 595,
      discount_total: 2899,
      tax_total: 5486,
      total: 32172,

      items: [
        {
          id: "item_1",
          title: "Faro LED Cartago",
          description: "Faro LED alta potencia",
          thumbnail: "url_imagen",
          unit_price: 9995,
          quantity: 2,
          variant: {
            id: "variant_1",
            title: "Negro",
            sku: "LED-001-B",
            barcode: "1234567890123",
          },
          subtotal: 19990,
          total: 21768,
          discount_total: 1999,
          tax_total: 3777,
        } as unknown as LineItem,
        {
          id: "item_2",
          title: "Soporte Universal",
          description: "Soporte universal aluminio",
          thumbnail: "url_imagen_2",
          unit_price: 9000,
          quantity: 1,
          variant: {
            id: "variant_2",
            title: "Plateado",
            sku: "SU-002-P",
            barcode: "1234567890555",
          },
          subtotal: 9000,
          total: 9792,
          discount_total: 900,
          tax_total: 1692,
        } as unknown as LineItem,
      ] as LineItem[],

      shipping_address: {
        first_name: "Juan",
        last_name: "Pérez",
        address_1: "Calle Principal 123",
        address_2: "Piso 4B",
        city: "Madrid",
        province: "Madrid",
        postal_code: "28001",
        country_code: "es",
        phone: "600123456",
        metadata: {
          nif_cif: "12345678Z",
        },
      } as unknown as Address,

      billing_address: {
        first_name: "Empresa",
        last_name: "Cartago 4x4",
        address_1: "Calle Facturación 456",
        address_2: "Oficina 7",
        city: "Madrid",
        province: "Madrid",
        postal_code: "28002",
        country_code: "es",
        phone: "600123456",
        metadata: {
          nif_cif: "12345678B",
        },
      } as unknown as Address,

      discounts: [
        {
          code: "WELCOME10",
          rule: {
            type: "percentage",
            value: 1000, // 10%
            description: "10% de descuento de bienvenida",
          },
        },
      ] as unknown as Discount[],

      shipping_methods: [
        {
          id: "sm_123",
          shipping_option: {
            id: "so_123",
            name: "Envío Estándar",
            price_type: "flat_rate",
            amount: 595, // 5.95€
          } as ShippingOption,
          price: 595,
          total: 595,
        },
      ] as unknown as ShippingMethod[],
    };

    // Configurar el mock del orderService para devolver nuestra orden mock
    orderServiceMock.retrieve.mockResolvedValue(mockOrder);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getTemplateData", () => {
    it("debe extraer correctamente los datos de la plantilla para order.placed", () => {
      const templateData = (orderSenderService as any).getTemplateData(
        "order.placed",
        mockOrder
      );

      expect(templateData).toHaveProperty("to_email", "cliente@ejemplo.com");
      expect(templateData).toHaveProperty("template_id", "template-id-123");
      expect(templateData.data).toHaveProperty("display_id", 12345);

      expect(templateData.data).toHaveProperty("customer", {
        email: "cliente@ejemplo.com",
        first_name: "Juan",
        full_name: "Juan Pérez",
        last_name: "Pérez",
        nif_cif: "12345678Z",
        phone: "600123456",
      });
      expect(templateData.data).toHaveProperty(
        "shipping_address",
        "Calle Principal 123 Piso 4B, Madrid, Madrid, 28001"
      );
      expect(templateData.data).toHaveProperty(
        "billing_address",
        "Calle Facturación 456 Oficina 7, Madrid, Madrid, 28002"
      );

      expect(templateData.data).toHaveProperty(
        "shipping_method",
        "Envío Estándar"
      );
      expect(templateData.data).toHaveProperty("shipping_total", "5,95 €");
      expect(templateData.data).toHaveProperty("discount_total", "28,99 €");

      expect(templateData.data).toHaveProperty("items");
      expect(templateData.data.items).toHaveLength(2);

      expect(templateData.data.items[0]).toHaveProperty("quantity", 2);
      expect(templateData.data.items[0]).toHaveProperty(
        "title",
        "Faro LED Cartago"
      );
      expect(templateData.data.items[0]).toHaveProperty("sku", "LED-001-B");
      expect(templateData.data.items[0]).toHaveProperty("ref", "1234567890123");

      expect(templateData.data).toHaveProperty("total", "321,72 €");
      expect(templateData.data).toHaveProperty("subtotal_ex_tax", "289,90 €");
      expect(templateData.data).toHaveProperty("tax_total", "54,86 €");
    });

    it("debe manejar órdenes inválidas o falsy", () => {
      const emptyResult = (orderSenderService as any).getTemplateData(
        "order.placed",
        null
      );
      expect(emptyResult).toHaveProperty("to_email", "");
      expect(emptyResult).toHaveProperty("template_id", "");
      expect(emptyResult.data).toBeUndefined();
    });
  });

  describe("sendNotification", () => {
    it("debe enviar correctamente una notificación de order.placed", async () => {
      const result = await orderSenderService.sendNotification(
        "order.placed",
        mockOrder as Order
      );

      // Verificar que orderService.retrieve fue llamado con el ID correcto
      expect(orderServiceMock.retrieve).toHaveBeenCalledWith(
        "order_123456",
        expect.any(Object)
      );

      // Verificar que se llamó a email.send
      expect(mockSendEmail).toHaveBeenCalledTimes(1);

      // Verificar que se llamó a sendNotificationToAdmin
      expect(
        (orderSenderService as any).sendNotificationToAdmin
      ).toHaveBeenCalled();

      expect(result).toHaveProperty("status", "sent");
      expect(result).toHaveProperty("to", "cliente@ejemplo.com");
      expect(result).toHaveProperty("data");
    });

    it("debe manejar errores al enviar notificaciones", async () => {
      // Forzamos un error en el envío
      mockSendEmail.mockRejectedValueOnce(new Error("Error de envío"));

      const result = await orderSenderService.sendNotification(
        "order.placed",
        mockOrder as Order
      );

      expect(result).toHaveProperty("status", "failed");
      expect(result).toHaveProperty("to", "cliente@ejemplo.com");
    });

    it("debe manejar error si no hay recipient email", async () => {
      const orderSinEmail = {
        ...mockOrder,
        email: undefined,
      };

      orderServiceMock.retrieve.mockResolvedValueOnce(orderSinEmail);

      const result = await orderSenderService.sendNotification("order.placed", {
        id: "order_123456",
      } as Order);

      expect(result).toHaveProperty("status", "failed");
    });

    it("debe manejar error si no hay template ID", async () => {
      // Guardar el template ID actual del servicio
      const originalTemplateId = (orderSenderService as any).config
        .template_overrides["order.placed"];

      // Modificar directamente la propiedad del servicio
      (orderSenderService as any).config.template_overrides["order.placed"] =
        "";

      const result = await orderSenderService.sendNotification(
        "order.placed",
        mockOrder as Order
      );

      expect(result).toHaveProperty("status", "failed");

      // Restaurar valor original
      (orderSenderService as any).config.template_overrides["order.placed"] =
        originalTemplateId;
    });
  });

  describe("sendNotificationToAdmin", () => {
    it("debe enviar correctamente una notificación al administrador", async () => {
      // Restauramos la implementación original del método
      (orderSenderService as any).sendNotificationToAdmin.mockRestore();

      // Configuramos el mock para buildCSVAttachment
      jest
        .spyOn(orderSenderService as any, "buildCSVAttachment")
        .mockResolvedValue("base64encodedcsv");

      const emailParams = new (jest.requireMock("mailersend").EmailParams)();

      const result = await (orderSenderService as any).sendNotificationToAdmin(
        mockOrder as Order,
        emailParams,
        { display_id: 12345 },
        "sent"
      );

      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty("status", "sent");
      expect(result).toHaveProperty("to", "admin@cartago4x4.es");
    });
  });

  describe("buildCSVAttachment", () => {
    it("debe generar correctamente un CSV con los datos del pedido", async () => {
      const csvData = await orderSenderService.buildCSVAttachment(
        mockOrder as Order
      );

      // Verificar que devuelve un string en base64
      expect(typeof csvData).toBe("string");

      // Decodificar el contenido del CSV para validar
      const decodedCsv = Buffer.from(csvData, "base64").toString("utf-8");

      // Verificar que contiene información del cliente      
      expect(decodedCsv).toContain("EMPRESA CARTAGO 4X4");
      expect(decodedCsv).toContain("28002 MADRID, MADRID");
      expect(decodedCsv).toContain("12345678B");
      expect(decodedCsv).toContain("15/5/2023");

      // Verificar que contiene información de los productos
      expect(decodedCsv).toContain("Faro LED Cartago");
      expect(decodedCsv).toContain("LED-001-B");
      expect(decodedCsv).toContain("Soporte Universal");
      expect(decodedCsv).toContain("SU-002-P");

      // Verificar que contiene información del método de envío
      expect(decodedCsv).toContain("Envío Estándar");

      // Verificar que contiene los detalles correctos de precios
      expect(decodedCsv).toContain("108,84"); // unit_price del Faro LED (21,77€/2)
      expect(decodedCsv).toContain("2"); // quantity del Faro LED
      expect(decodedCsv).toContain("199,90"); // subtotal del Faro LED
      expect(decodedCsv).toContain("19,99"); // discount_total del Faro LED
      expect(decodedCsv).toContain("217,68"); // total del Faro LED

      // Verificar el segundo item
      expect(decodedCsv).toContain("97,92"); // unit_price del Soporte Universal
      expect(decodedCsv).toContain("1"); // quantity del Soporte Universal
      expect(decodedCsv).toContain("90,00"); // subtotal del Soporte Universal
      expect(decodedCsv).toContain("9,00"); // discount_total del Soporte Universal
      expect(decodedCsv).toContain("97,92"); // total del Soporte Universal

      // Verificar totales generales y método de envío
      expect(decodedCsv).toContain("5,95"); // shipping_total
    });

    it("debe manejar pedidos con datos incompletos", async () => {
      const incompleteOrder = {
        ...mockOrder,
        items: [],
        shipping_address: {},
        billing_address: {},
        shipping_methods: [],
      } as unknown as Order;

      const csvData = await orderSenderService.buildCSVAttachment(
        incompleteOrder
      );

      // Verificar que devuelve un string en base64 a pesar de los datos incompletos
      expect(typeof csvData).toBe("string");

      const decodedCsv = Buffer.from(csvData, "base64").toString("utf-8");

      // Verificar que contiene al menos la estructura básica del CSV
      expect(decodedCsv).toContain("customer");
      expect(decodedCsv).toContain("title");
      expect(decodedCsv).toContain("sku");
      expect(decodedCsv).toContain("quantity");
    });

    it("debe eliminar las referencias a EUR en el CSV generado", async () => {
      const csvData = await orderSenderService.buildCSVAttachment(
        mockOrder as Order
      );
      const decodedCsv = Buffer.from(csvData, "base64").toString("utf-8");

      // Verificar que no hay referencias a EUR en el CSV
      expect(decodedCsv).not.toContain(" €");

      // Verificar que aparecen los valores monetarios sin EUR
      expect(decodedCsv).toContain("90,00");
      expect(decodedCsv).toContain("97,92");
    });

    it("debe incluir correctamente los métodos de envío en el CSV", async () => {
      const csvData = await orderSenderService.buildCSVAttachment(
        mockOrder as Order
      );
      const decodedCsv = Buffer.from(csvData, "base64").toString("utf-8");

      // Verificar que incluye el método de envío
      expect(decodedCsv).toContain("Envío Estándar");
      expect(decodedCsv).toContain("5,95"); // Precio del envío (5.95€)
    });
  });
});
