import pino from "pino";

const isDevelopment = process.env.NODE_ENV !== "production";

/**
 * Logger estructurado con Pino para el backend de Cartago Store.
 *
 * En desarrollo usa pino-pretty para visualización legible.
 * En producción genera JSON estructurado para análisis.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  base: {
    service: "cartago-store-backend",
    env: process.env.NODE_ENV || "development",
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Logger hijo para módulo de webhooks de pago.
 * Incluye contexto automático del módulo en cada log.
 */
export const webhookLogger = logger.child({ module: "payment-webhooks" });

/**
 * Logger hijo para subscribers de eventos.
 * Incluye contexto automático del módulo en cada log.
 */
export const subscriberLogger = logger.child({ module: "subscribers" });

/**
 * Logger hijo para servicios de pago.
 * Incluye contexto automático del módulo en cada log.
 */
export const paymentLogger = logger.child({ module: "payment-service" });

export default logger;
