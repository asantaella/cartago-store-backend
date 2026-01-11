import { EventBusService } from "@medusajs/medusa";
import { subscriberLogger } from "./logger";

export interface RetryOptions {
  maxRetries?: number;
  delays?: number[];
  context: {
    operation: string;
    [key: string]: unknown;
  };
  eventBus?: EventBusService;
}

/**
 * Ejecuta una función con retry y backoff exponencial.
 *
 * Si falla después de todos los intentos, emite el evento
 * 'payment.operation.critical_failure' para alertar al equipo.
 *
 * @param fn - Función asíncrona a ejecutar
 * @param options - Configuración de retry y contexto
 * @returns Resultado de la función o lanza el último error
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const delays = options.delays ?? [1000, 5000, 15000];
  const { context, eventBus } = options;

  let lastError: Error | unknown;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const result = await fn();

      if (attempt > 0) {
        subscriberLogger.info(
          {
            ...context,
            attempt,
            status: "success_after_retry",
          },
          `Operation succeeded after ${attempt} retry attempt(s)`
        );
      }

      return result;
    } catch (error) {
      lastError = error;
      attempt++;

      const logContext = {
        ...context,
        attempt,
        max_retries: maxRetries,
        error: error instanceof Error ? error.message : String(error),
      };

      if (attempt <= maxRetries) {
        const delay = delays[attempt - 1] ?? delays[delays.length - 1];

        subscriberLogger.warn(
          {
            ...logContext,
            retry_in_ms: delay,
          },
          `Operation failed, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Todos los intentos fallaron
        subscriberLogger.error(
          {
            ...logContext,
            status: "critical_failure",
          },
          `Operation failed after ${maxRetries} retry attempts - emitting critical failure event`
        );

        // Emitir evento crítico para alertar al equipo
        if (eventBus) {
          try {
            await eventBus.emit("payment.operation.critical_failure", {
              ...context,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              failed_at: new Date().toISOString(),
              total_attempts: attempt,
            });

            subscriberLogger.info(
              logContext,
              "Critical failure event emitted successfully"
            );
          } catch (emitError) {
            subscriberLogger.error(
              {
                ...logContext,
                emit_error:
                  emitError instanceof Error
                    ? emitError.message
                    : String(emitError),
              },
              "Failed to emit critical failure event"
            );
          }
        }

        // Relanzar el último error
        throw lastError;
      }
    }
  }

  // Esto nunca debería alcanzarse, pero TypeScript lo requiere
  throw lastError;
}
