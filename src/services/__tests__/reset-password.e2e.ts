import ResetPasswordService from "../reset-password";
import { Customer } from "@medusajs/medusa";

// Mock de MailerSend y sus componentes
const mockSend = jest.fn().mockResolvedValue({ status: "sent" });

jest.mock("mailersend", () => {
  return {
    MailerSend: jest.fn().mockImplementation(() => ({
      email: {
        send: mockSend,
      },
    })),
    EmailParams: jest.fn().mockImplementation(() => ({
      setFrom: jest.fn().mockReturnThis(),
      setTo: jest.fn().mockReturnThis(),
      setSubject: jest.fn().mockReturnThis(),
      setHtml: jest.fn().mockReturnThis(),
      setTemplateId: jest.fn().mockReturnThis(),
      setPersonalization: jest.fn().mockReturnThis(),
    })),
    Recipient: jest.fn(),
    Sender: jest.fn(),
  };
});

// Configuración para tests (simulando variables de entorno)
const ENV_CONFIG = {
  MAILERSEND_API_KEY: "test_api_key",
  MAILERSEND_FROM_EMAIL: "equipo@cartago4x4.es",
  MAILERSEND_FROM_NAME: "Cartago4x4",
  MAILERSEND_SENDER_ADDRESS:
    "Alameda de San Anton 23, 30205, Cartagena (Murcia), España",
  MAILERSEND_RESET_PASSWORD_TEMPLATE_ID: "o65qngk7w5wlwr12",
  MAILERSEND_RESET_PASSWORD_URL: "https://cartago4x4.es/account/reset-password",
  MAILERSEND_SUPPORT_URL: "https://cartago4x4.es/support",
};

// Guardar valores originales de variables de entorno
const originalEnv = { ...process.env };

describe("ResetPasswordService e2e tests", () => {
  let resetPasswordService: ResetPasswordService;
  let customer: Partial<Customer> & { token: string };

  beforeAll(() => {
    // Configurar variables de entorno para las pruebas
    process.env.MAILERSEND_API_KEY = ENV_CONFIG.MAILERSEND_API_KEY;
    process.env.MAILERSEND_FROM_EMAIL = ENV_CONFIG.MAILERSEND_FROM_EMAIL;
    process.env.MAILERSEND_FROM_NAME = ENV_CONFIG.MAILERSEND_FROM_NAME;
    process.env.MAILERSEND_SENDER_ADDRESS =
      ENV_CONFIG.MAILERSEND_SENDER_ADDRESS;
    process.env.MAILERSEND_RESET_PASSWORD_TEMPLATE_ID =
      ENV_CONFIG.MAILERSEND_RESET_PASSWORD_TEMPLATE_ID;
    process.env.MAILERSEND_RESET_PASSWORD_URL =
      ENV_CONFIG.MAILERSEND_RESET_PASSWORD_URL;
    process.env.MAILERSEND_SUPPORT_URL = ENV_CONFIG.MAILERSEND_SUPPORT_URL;
  });

  afterAll(() => {
    // Restaurar variables de entorno originales
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Crear instancia del servicio para pruebas
    resetPasswordService = new ResetPasswordService({}, {});

    // Datos de prueba del cliente
    customer = {
      id: "cus_test123",
      email: "test@example.com",
      first_name: "John",
      last_name: "Doe",
      token: "test_reset_token",
    };
  });

  describe("Constructor e inicialización", () => {
    it("debe inicializar correctamente la configuración desde variables de entorno", () => {
      // Verificar que la configuración se carga correctamente desde las variables de entorno
      expect(resetPasswordService["config"]).toBeDefined();
      expect(resetPasswordService["config"].reset_password_url).toBe(
        ENV_CONFIG.MAILERSEND_RESET_PASSWORD_URL
      );
      expect(resetPasswordService["config"].support_url).toBe(
        ENV_CONFIG.MAILERSEND_SUPPORT_URL
      );
      expect(resetPasswordService["config"].from_name).toBe(
        ENV_CONFIG.MAILERSEND_FROM_NAME
      );
      expect(resetPasswordService["config"].sender_address).toBe(
        ENV_CONFIG.MAILERSEND_SENDER_ADDRESS
      );
    });

    it("debe inicializar correctamente el servicio MailerSend", () => {
      // Verificar que se inicializa el cliente de MailerSend
      expect(resetPasswordService["mailerSendService"]).toBeDefined();
    });
  });

  describe("sendNotification", () => {
    it("debe enviar correctamente un correo de restablecimiento de contraseña", async () => {
      // Ejecutar el método a probar
      const result = await resetPasswordService.sendNotification(
        "customer.password_reset",
        customer
      );

      // Verificar que se llamó al método de envío de MailerSend
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Verificar resultado del envío
      expect(result).toEqual({
        to: customer.email,
        status: "sent",
        data: customer,
      });
    });

    it("debe manejar errores durante el envío de correos", async () => {
      // Simular un error en el envío
      mockSend.mockRejectedValueOnce(new Error("Error de envío simulado"));

      // Espiar el console.error para verificar que se registra el error
      const consoleSpy = jest.spyOn(console, "error");

      try {
        // Ejecutar el método a probar
        await resetPasswordService.sendNotification(
          "customer.password_reset",
          customer
        );
      } catch (error) {
        // Verificar que se registra el error
        expect(consoleSpy).toHaveBeenCalled();
        expect(error.message).toBe("Error de envío simulado");
      }

      // Restaurar el mock
      consoleSpy.mockRestore();
    });
  });

  describe("resendNotification", () => {
    it("debe reenviar correctamente una notificación con nuevo destinatario", async () => {
      // Datos de notificación original
      const originalNotification = {
        to: "original@example.com",
        status: "sent",
        data: {
          id: "cus_123",
          email: "original@example.com",
          first_name: "John",
          last_name: "Doe",
          token: "original_token",
        },
      };

      // Espiar el método sendNotification
      const spySendNotification = jest
        .spyOn(resetPasswordService, "sendNotification")
        .mockResolvedValueOnce({
          to: "new@example.com",
          status: "sent",
          data: {
            ...originalNotification.data,
            email: "new@example.com",
          },
        });

      // Ejecutar reenvío con nuevo email
      const result = await resetPasswordService.resendNotification(
        originalNotification,
        { to: "new@example.com" }
      );

      // Verificar que se llamó a sendNotification con los datos actualizados
      expect(spySendNotification).toHaveBeenCalledTimes(1);
      expect(spySendNotification).toHaveBeenCalledWith(
        "customer.password_reset",
        {
          ...originalNotification.data,
          email: "new@example.com",
        }
      );

      // Verificar el resultado
      expect(result.to).toBe("new@example.com");
      expect(result.status).toBe("sent");
    });

    it("debe devolver la notificación original cuando no hay cambio de destinatario", async () => {
      // Datos de notificación original
      const originalNotification = {
        to: "original@example.com",
        status: "sent",
        data: {
          id: "cus_123",
          email: "original@example.com",
          first_name: "John",
          last_name: "Doe",
          token: "original_token",
        },
      };

      // Espiar el método sendNotification
      const spySendNotification = jest.spyOn(
        resetPasswordService,
        "sendNotification"
      );

      // Ejecutar reenvío sin cambiar email
      const result = await resetPasswordService.resendNotification(
        originalNotification,
        {}
      );

      // Verificar que NO se llamó a sendNotification
      expect(spySendNotification).not.toHaveBeenCalled();

      // Verificar el resultado
      expect(result.to).toBe("original@example.com");
      expect(result.status).toBe("done");
      expect(result.data).toEqual(originalNotification.data);
    });
  });

  describe("Integración con MailerSend", () => {
    it("debe generar correctamente los datos con getTemplateData", async () => {
      // Acceder al método privado mediante reflection
      const getTemplateData =
        resetPasswordService["getTemplateData"].bind(resetPasswordService);

      // Llamar al método directamente
      const templateData = getTemplateData(customer);

      // Verificar que los datos se generan correctamente con la configuración
      expect(templateData.to).toBe(customer.email);
      expect(templateData.to_name).toBe(
        `${customer.first_name} ${customer.last_name}`
      );
      expect(templateData.data.name).toBe(customer.first_name);
      expect(templateData.data.action_url).toBe(
        `${ENV_CONFIG.MAILERSEND_RESET_PASSWORD_URL}?email=${customer.email}&token=${customer.token}`
      );
      expect(templateData.data.token).toBe(customer.token);
    });

    it("debe manejar casos de entrada inválida en getTemplateData", async () => {
      // Acceder al método privado
      const getTemplateData =
        resetPasswordService["getTemplateData"].bind(resetPasswordService);

      // Probar con datos null
      const resultNull = getTemplateData(null);
      expect(resultNull).toEqual({
        to: "",
        data: {},
      });

      // Probar con datos undefined
      const resultUndefined = getTemplateData(undefined);
      expect(resultUndefined).toEqual({
        to: "",
        data: {},
      });

      // Probar con datos incompletos
      const resultIncomplete = getTemplateData({
        email: "test@example.com",
        token: "token123",
      } as any);
      expect(resultIncomplete.to).toBe("test@example.com");
      expect(resultIncomplete.data.name).toBeUndefined();
    });
  });
});
